// =============================================================================
// storage/blobStorage.js  —  CAPA DE STORAGE PARA VERCEL / NODE
// =============================================================================
// Esta capa se encarga SOLO de los archivos binarios (imagenes y modelos .glb).
// El registro en base de datos (la fila con la URL) lo hace el adaptador de
// datos; aca solo subimos/borramos el archivo fisico y devolvemos su URL
// publica.
//
// SOPORTA DOS BACKENDS DE ARCHIVOS, elegidos por variables de entorno:
//
//   1) Vercel Blob   -> si existe BLOB_READ_WRITE_TOKEN
//        Es el almacenamiento de archivos nativo de Vercel. Esto es lo que usas
//        cuando quieres "todo dentro de Vercel". Requiere el paquete
//        @vercel/blob (incluido en package.json del bloque).
//
//   2) Supabase Storage -> si existe SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//        Fallback para que NO tengas que migrar los archivos el dia 1. Puedes
//        dejar las imagenes/modelos viejos en Supabase Storage mientras pruebas
//        la BD nueva, y migrar los archivos despues.
//
// Si no hay ninguno configurado, las operaciones de subida lanzan 503 (el
// resto de la API sigue viva: leer menu, login, etc.).
//
// CONTRATO (lo que server.js espera de este modulo):
//   uploadFileToStorage(file, folder) -> Promise<string url>
//   deleteStorageFile(url)            -> Promise<{deleted}|{error}|null>
//   isManagedStorageUrl(value)        -> boolean
//
// `file` tiene la forma de multer memoryStorage:
//   { originalname, mimetype, buffer }
// =============================================================================

const crypto = require("crypto");
const path = require("path");

// -----------------------------------------------------------------------------
// Deteccion de backend
// -----------------------------------------------------------------------------
function hasVercelBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
function hasSupabaseStorage() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "menu-assets";
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Genera un nombre de archivo unico conservando la extension original.
function buildFileName(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

// -----------------------------------------------------------------------------
// Cliente lazy de Supabase (solo si se usa ese backend)
// -----------------------------------------------------------------------------
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!hasSupabaseStorage()) return null;
  // require diferido: si no usas Supabase, no se carga el SDK.
  const { createClient } = require("@supabase/supabase-js");
  _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

// =============================================================================
// SUBIDA
// =============================================================================
async function uploadFileToStorage(file, folder) {
  if (!file || !file.buffer) throw httpError(400, "Archivo invalido");
  const fileName = buildFileName(file.originalname);
  const filePath = `${folder}/${fileName}`;

  // --- Backend 1: Vercel Blob ---
  if (hasVercelBlob()) {
    // require diferido para no exigir el paquete si no se usa.
    const { put } = require("@vercel/blob");
    const blob = await put(filePath, file.buffer, {
      access: "public",
      contentType: file.mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false, // ya generamos uno nosotros
    });
    return blob.url;
  }

  // --- Backend 2: Supabase Storage ---
  if (hasSupabaseStorage()) {
    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from(getStorageBucket())
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw httpError(500, `Error al subir archivo: ${error.message}`);
    const { data } = supabase.storage.from(getStorageBucket()).getPublicUrl(filePath);
    return data.publicUrl;
  }

  throw httpError(
    503,
    "Storage no configurado. Define BLOB_READ_WRITE_TOKEN (Vercel Blob) " +
      "o SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase Storage).",
  );
}

// =============================================================================
// BORRADO
// =============================================================================
async function deleteStorageFile(url) {
  if (!url || typeof url !== "string") return null;

  // --- Vercel Blob: las URLs son https://<id>.public.blob.vercel-storage.com/... ---
  if (hasVercelBlob() && url.includes(".blob.vercel-storage.com")) {
    try {
      const { del } = require("@vercel/blob");
      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return { deleted: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  // --- Supabase Storage ---
  if (hasSupabaseStorage()) {
    try {
      const parsed = new URL(url);
      const supabaseHost = new URL(process.env.SUPABASE_URL).hostname;
      if (parsed.hostname !== supabaseHost) return null;

      const match = parsed.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
      if (!match || !match[1]) return null;

      const supabase = getSupabase();
      const { error } = await supabase.storage.from(getStorageBucket()).remove([match[1]]);
      if (error) return { error: error.message };
      return { deleted: true };
    } catch {
      return null;
    }
  }

  return null;
}

// =============================================================================
// VALIDACION DE URL
// =============================================================================
// Devuelve true si la URL pertenece a alguno de los storages que administramos.
// server.js la usa para aceptar URLs de imagenes al crear/editar platos
// (ademas de los paths locales /assets/...).
function isManagedStorageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  // Vercel Blob
  if (value.includes(".blob.vercel-storage.com")) return true;
  // Supabase Storage
  if (hasSupabaseStorage()) {
    try {
      const parsed = new URL(value);
      const supabaseHost = new URL(process.env.SUPABASE_URL).hostname;
      return (
        parsed.hostname === supabaseHost && parsed.pathname.includes("/storage/v1/object/public/")
      );
    } catch {
      return false;
    }
  }
  return false;
}

module.exports = {
  uploadFileToStorage,
  deleteStorageFile,
  isManagedStorageUrl,
  // expuesto por compatibilidad con codigo que lo importaba del store viejo
  isSupabaseStorageUrl: isManagedStorageUrl,
};
