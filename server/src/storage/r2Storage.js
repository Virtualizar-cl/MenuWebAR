// =============================================================================
// storage/r2Storage.js  —  CAPA DE STORAGE PARA CLOUDFLARE (R2)
// =============================================================================
// Equivalente a storage/blobStorage.js pero para R2. Maneja SOLO el binario
// (imagenes y modelos .glb); el registro en BD lo hace el adaptador D1.
//
// COMO RECIBE EL BINDING Y LA URL PUBLICA:
//   Igual que D1, R2 vive en `env`. El worker deja, por request:
//     globalThis.__R2      -> el bucket binding (env.ASSETS)
//     globalThis.__R2_BASE -> la URL publica base del bucket (env.R2_PUBLIC_URL)
//   La URL publica es el dominio del bucket (r2.dev o dominio propio). Las
//   claves de los objetos quedan como "images/<rand>.jpg", "models/<rand>.glb".
//
// CONTRATO (lo que el worker espera de este modulo), identico a blobStorage:
//   uploadFileToStorage(file, folder) -> Promise<string url>
//   deleteStorageFile(url)            -> Promise<{deleted}|{error}|null>
//   isManagedStorageUrl(value)        -> boolean
//
// `file` mantiene la forma multer-like que ya usa el worker:
//   { originalname, mimetype, buffer }
// =============================================================================

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function getBucket() {
  return globalThis.__R2 || null;
}
function getPublicBase() {
  // Sin barra final, para concatenar limpio con la key.
  const base = globalThis.__R2_BASE || "";
  return base.replace(/\/+$/, "");
}

function extname(name) {
  const i = (name || "").lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// Nombre unico conservando extension. crypto.randomUUID existe en Workers.
function buildKey(folder, originalname) {
  const ext = extname(originalname);
  const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(
    /[^a-z0-9]/gi,
    "",
  );
  return `${folder}/${Date.now()}-${rand}${ext}`;
}

// =============================================================================
// SUBIDA
// =============================================================================
async function uploadFileToStorage(file, folder) {
  const bucket = getBucket();
  if (!bucket) {
    throw httpError(503, "Storage no configurado (falta el binding R2 ASSETS)");
  }
  const base = getPublicBase();
  if (!base) {
    throw httpError(503, "Storage no configurado (falta R2_PUBLIC_URL)");
  }
  if (!file || !file.buffer) throw httpError(400, "Archivo invalido");

  const key = buildKey(folder, file.originalname);
  await bucket.put(key, file.buffer, {
    httpMetadata: { contentType: file.mimetype },
  });

  return `${base}/${key}`;
}

// =============================================================================
// BORRADO
// =============================================================================
async function deleteStorageFile(url) {
  if (!url || typeof url !== "string") return null;
  const bucket = getBucket();
  const base = getPublicBase();
  if (!bucket || !base) return null;
  if (!url.startsWith(base + "/")) return null;

  const key = url.slice(base.length + 1);
  if (!key) return null;

  try {
    await bucket.delete(key);
    return { deleted: true };
  } catch (err) {
    return { error: err.message };
  }
}

// =============================================================================
// VALIDACION DE URL
// =============================================================================
function isManagedStorageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const base = getPublicBase();
  return Boolean(base) && value.startsWith(base + "/");
}

export {
  uploadFileToStorage,
  deleteStorageFile,
  isManagedStorageUrl,
  isManagedStorageUrl as isSupabaseStorageUrl,
};
