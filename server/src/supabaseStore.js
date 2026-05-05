// Esta es la capa de acceso a datos. Todo lo que tenga que ver con leer o
// escribir en Supabase pasa por aca. El server.js solo sabe de endpoints HTTP
// y llama a estas funciones.
//
// Hay una particularidad importante: el frontend trabaja con ids tipo string
// ("item-12", "cat-bebidas", "img-3") pero la BD usa integers autoincrement.
// Las funciones parseIntId / formatItemId se encargan de traducir en los dos
// sentidos.

const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const supabase = isSupabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!isSupabaseEnabled) {
  console.warn(
    "WARNING: Supabase no configurado (falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).",
  );
}

const HISTORIAL_COLORES_MAX = 8;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const PERMISSION_KEYS = [
  "puede_crear_platos",
  "puede_editar_platos",
  "puede_eliminar_platos",
  "puede_gestionar_categorias",
  "puede_subir_archivos",
  "puede_eliminar_archivos",
  "puede_gestionar_usuarios",
];

// =====================================================
// HELPERS
// =====================================================

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireClient() {
  if (!supabase) {
    throw httpError(503, "Supabase no esta configurado");
  }
}

function parseIntId(stringId) {
  if (typeof stringId !== "string") return null;
  const match = stringId.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function formatItemId(intId) {
  return `item-${intId}`;
}
function formatCategoryId(intId) {
  return `cat-${intId}`;
}
function formatImagenId(intId) {
  return `img-${intId}`;
}
function formatModeloId(intId) {
  return `mod-${intId}`;
}

function isDescuentoActive(descuento, inicio, fin, now = Date.now()) {
  if (!descuento || descuento <= 0) return false;
  if (inicio) {
    const ini = new Date(inicio).getTime();
    if (Number.isFinite(ini) && now < ini) return false;
  }
  if (fin) {
    const f = new Date(fin).getTime();
    if (Number.isFinite(f) && now > f) return false;
  }
  return true;
}

// =====================================================
// MAPEOS BD -> FRONTEND
// =====================================================

function roundTo990(raw) {
  if (raw < 990) return Math.max(0, Math.round(raw));
  const rounded = Math.floor(raw / 1000) * 1000 + 990;
  return rounded > raw ? rounded - 1000 : rounded;
}

function mapCategoryRow(row) {
  return { id: formatCategoryId(row.id_categ), label: row.nombre_categ };
}

function mapImagenRow(row) {
  return { id: formatImagenId(row.id_image), label: row.nombre_image, src: row.url_image };
}

function mapModeloRow(row) {
  return { id: formatModeloId(row.id_model), label: row.nombre_model, src: row.url_model };
}

function mapItemRow(row, { categoriesById, imagenesById, modelosById }) {
  const category = categoriesById.get(row.categoria);
  const imagen = row.imagen != null ? imagenesById.get(row.imagen) : null;
  const modelo = row.modelo != null ? modelosById.get(row.modelo) : null;

  const descuento = Number.isInteger(row.descuento) ? row.descuento : 0;
  const active = isDescuentoActive(descuento, row.descuento_inicio, row.descuento_fin);
  const discountedPrice = active ? roundTo990(row.precio * (1 - descuento / 100)) : row.precio;

  return {
    id: formatItemId(row.id),
    name: row.nombre,
    description: row.descripcion || "",
    price: String(row.precio),
    category: category ? category.id : null,
    image: imagen ? imagen.src : "",
    modelAR: modelo ? modelo.id : "",
    ingredients: Array.isArray(row.ingredientes) ? row.ingredientes : [],
    cardColor: row.cardColor || "#152238",
    cardMessage: row.cardMessage || null,
    descuento,
    descuentoInicio: row.descuento_inicio || null,
    descuentoFin: row.descuento_fin || null,
    discountActive: active,
    discountedPrice: String(discountedPrice),
  };
}

function mapUsuarioRow(row) {
  const permissions = {};
  for (const key of PERMISSION_KEYS) {
    permissions[key] = Boolean(row[key]);
  }
  return {
    id: row.id_usuario,
    email: row.email,
    permissions,
    createdAt: row.creado_en,
  };
}

// =====================================================
// LOAD ALL DATA
// =====================================================

async function loadSupabaseData() {
  requireClient();

  const [catsRes, imgsRes, modsRes, itemsRes] = await Promise.all([
    supabase.from("categorias").select("*").order("id_categ"),
    supabase.from("imagenes").select("*").order("id_image"),
    supabase.from("modelos").select("*").order("id_model"),
    supabase.from("platos").select("*").order("id"),
  ]);

  if (catsRes.error) throw httpError(500, `Error cargando categorias: ${catsRes.error.message}`);
  if (imgsRes.error) throw httpError(500, `Error cargando imagenes: ${imgsRes.error.message}`);
  if (modsRes.error) throw httpError(500, `Error cargando modelos: ${modsRes.error.message}`);
  if (itemsRes.error) throw httpError(500, `Error cargando platos: ${itemsRes.error.message}`);

  const categories = catsRes.data.map(mapCategoryRow);
  const imagenes = imgsRes.data.map(mapImagenRow);
  const modelos = modsRes.data.map(mapModeloRow);

  const categoriesById = new Map(catsRes.data.map((r) => [r.id_categ, mapCategoryRow(r)]));
  const imagenesById = new Map(imgsRes.data.map((r) => [r.id_image, mapImagenRow(r)]));
  const modelosById = new Map(modsRes.data.map((r) => [r.id_model, mapModeloRow(r)]));

  const menuItems = itemsRes.data.map((row) =>
    mapItemRow(row, { categoriesById, imagenesById, modelosById }),
  );

  return { categories, imagenes, modelos, menuItems };
}

// Helper privado: recarga toda la data y devuelve el plato con id especifico
// con relaciones resueltas. Si no esta en la lista (raro), cae a un mapItemRow
// con maps vacios. Centraliza el patron usado por createItem/updateItem.
async function reloadAndFindItem(rawRow) {
  const all = await loadSupabaseData();
  const found = all.menuItems.find((i) => i.id === formatItemId(rawRow.id));
  return (
    found ||
    mapItemRow(rawRow, {
      categoriesById: new Map(),
      imagenesById: new Map(),
      modelosById: new Map(),
    })
  );
}

// Helper privado: si el cardColor del payload es valido, lo empuja al historial
// en background con errores silenciados. Usado por create/update.
function pushColorBackground(cardColor) {
  if (cardColor && HEX_COLOR_RE.test(cardColor)) {
    pushColorToHistorial(cardColor).catch((e) =>
      console.warn("No se pudo guardar color en historial:", e.message),
    );
  }
}

// =====================================================
// CATEGORIES
// =====================================================

async function createCategory({ label }) {
  requireClient();

  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre_categ: label })
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  return mapCategoryRow(data);
}

async function updateCategory(stringId, { label }) {
  requireClient();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de categoria invalido");

  const payload = {};
  if (label !== undefined) payload.nombre_categ = label;

  const { data, error } = await supabase
    .from("categorias")
    .update(payload)
    .eq("id_categ", intId)
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  if (!data) throw httpError(404, "Categoria no encontrada");
  return mapCategoryRow(data);
}

async function deleteCategory(stringId) {
  requireClient();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de categoria invalido");

  const { error: platosErr } = await supabase.from("platos").delete().eq("categoria", intId);
  if (platosErr) throw httpError(500, platosErr.message);

  const { error } = await supabase.from("categorias").delete().eq("id_categ", intId);
  if (error) throw httpError(500, error.message);

  return { deleted: true };
}

// =====================================================
// IMAGENES
// =====================================================

async function createImagenAsset({ label, url }) {
  requireClient();

  const { data, error } = await supabase
    .from("imagenes")
    .insert({ nombre_image: label, url_image: url })
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  return mapImagenRow(data);
}

async function deleteImagenAsset(stringId) {
  requireClient();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de imagen invalido");

  const { data: existing, error: fetchErr } = await supabase
    .from("imagenes")
    .select("url_image")
    .eq("id_image", intId)
    .single();

  if (fetchErr) throw httpError(404, "Imagen no encontrada");

  const { error: refErr } = await supabase
    .from("platos")
    .update({ imagen: null })
    .eq("imagen", intId);
  if (refErr) throw httpError(500, refErr.message);

  const { error } = await supabase.from("imagenes").delete().eq("id_image", intId);
  if (error) throw httpError(500, error.message);

  return { deleted: true, url: existing.url_image };
}

// =====================================================
// MODELOS
// =====================================================

async function createModeloAsset({ label, url }) {
  requireClient();

  const { data, error } = await supabase
    .from("modelos")
    .insert({ nombre_model: label, url_model: url })
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  return mapModeloRow(data);
}

// =====================================================
// ITEMS (PLATOS)
// =====================================================

async function resolveItemFks({ category, image, modelAR }) {
  const result = {};

  if (category !== undefined) {
    const catIntId = parseIntId(category);
    if (catIntId == null) throw httpError(400, "category id invalido");
    result.categoria = catIntId;
  }

  if (image !== undefined) {
    if (!image) {
      result.imagen = null;
    } else {
      const { data, error } = await supabase
        .from("imagenes")
        .select("id_image")
        .eq("url_image", image)
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(400, "Imagen no registrada en BD");
      result.imagen = data.id_image;
    }
  }

  if (modelAR !== undefined) {
    if (!modelAR) {
      result.modelo = null;
    } else {
      const modIntId = parseIntId(modelAR);
      if (modIntId == null) throw httpError(400, "modelAR id invalido");
      result.modelo = modIntId;
    }
  }

  return result;
}

function buildDescuentoPayload({ descuento, descuentoInicio, descuentoFin }) {
  const out = {};

  if (descuento !== undefined) {
    const n = parseInt(descuento, 10);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      throw httpError(400, "descuento debe ser un entero entre 0 y 100");
    }
    out.descuento = n;
  }

  if (descuentoInicio !== undefined) {
    if (descuentoInicio === null || descuentoInicio === "") {
      out.descuento_inicio = null;
    } else {
      const d = new Date(descuentoInicio);
      if (Number.isNaN(d.getTime())) throw httpError(400, "descuentoInicio invalido");
      out.descuento_inicio = d.toISOString();
    }
  }

  if (descuentoFin !== undefined) {
    if (descuentoFin === null || descuentoFin === "") {
      out.descuento_fin = null;
    } else {
      const d = new Date(descuentoFin);
      if (Number.isNaN(d.getTime())) throw httpError(400, "descuentoFin invalido");
      out.descuento_fin = d.toISOString();
    }
  }

  if (out.descuento_inicio && out.descuento_fin) {
    if (new Date(out.descuento_fin) < new Date(out.descuento_inicio)) {
      throw httpError(400, "descuentoFin no puede ser anterior a descuentoInicio");
    }
  }

  return out;
}

async function createItem(payload) {
  requireClient();

  const {
    category,
    name,
    description,
    price,
    image,
    modelAR,
    ingredients,
    cardColor,
    cardMessage,
    descuento,
    descuentoInicio,
    descuentoFin,
  } = payload;

  const fks = await resolveItemFks({ category, image, modelAR });

  const priceInt = parseInt(String(price).replace(/[^\d]/g, ""), 10);
  if (Number.isNaN(priceInt)) throw httpError(400, "precio invalido");

  const descPayload = buildDescuentoPayload({
    descuento: descuento === undefined ? 0 : descuento,
    descuentoInicio,
    descuentoFin,
  });

  const insertRow = {
    nombre: name,
    descripcion: description || "",
    precio: priceInt,
    categoria: fks.categoria,
    imagen: fks.imagen ?? null,
    modelo: fks.modelo ?? null,
    ingredientes: Array.isArray(ingredients) ? ingredients : [],
    cardColor: cardColor || "#152238",
    cardMessage: cardMessage && cardMessage.trim() ? cardMessage.trim() : null,
    ...descPayload,
  };

  const { data, error } = await supabase.from("platos").insert(insertRow).select().single();
  if (error) throw httpError(500, error.message);

  pushColorBackground(insertRow.cardColor);
  return reloadAndFindItem(data);
}

async function updateItem(stringId, payload) {
  requireClient();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de plato invalido");

  const updateRow = {};

  if (payload.name !== undefined) updateRow.nombre = payload.name;
  if (payload.description !== undefined) updateRow.descripcion = payload.description || "";
  if (payload.price !== undefined) {
    const priceInt = parseInt(String(payload.price).replace(/[^\d]/g, ""), 10);
    if (Number.isNaN(priceInt)) throw httpError(400, "precio invalido");
    updateRow.precio = priceInt;
  }
  if (payload.ingredients !== undefined) {
    updateRow.ingredientes = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  }
  if (payload.cardColor !== undefined) {
    updateRow.cardColor = payload.cardColor || "#152238";
  }
  if (payload.cardMessage !== undefined) {
    updateRow.cardMessage =
      payload.cardMessage && String(payload.cardMessage).trim()
        ? String(payload.cardMessage).trim()
        : null;
  }

  const descPayload = buildDescuentoPayload({
    descuento: payload.descuento,
    descuentoInicio: payload.descuentoInicio,
    descuentoFin: payload.descuentoFin,
  });
  Object.assign(updateRow, descPayload);

  const fks = await resolveItemFks({
    category: payload.category,
    image: payload.image,
    modelAR: payload.modelAR,
  });
  Object.assign(updateRow, fks);

  if (Object.keys(updateRow).length === 0) {
    throw httpError(400, "Nada que actualizar");
  }

  const { data, error } = await supabase
    .from("platos")
    .update(updateRow)
    .eq("id", intId)
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  if (!data) throw httpError(404, "Plato no encontrado");

  pushColorBackground(updateRow.cardColor);
  return reloadAndFindItem(data);
}

async function deleteItem(stringId) {
  requireClient();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de plato invalido");

  const { error } = await supabase.from("platos").delete().eq("id", intId);
  if (error) throw httpError(500, error.message);

  return { deleted: true };
}

// =====================================================
// HISTORIAL DE COLORES
// =====================================================

async function listColorHistorial() {
  requireClient();

  const { data, error } = await supabase
    .from("historial_colores")
    .select("color, used_at")
    .order("used_at", { ascending: false })
    .limit(HISTORIAL_COLORES_MAX);

  if (error) throw httpError(500, error.message);
  return (data || []).map((r) => r.color);
}

async function pushColorToHistorial(color) {
  requireClient();

  if (typeof color !== "string" || !HEX_COLOR_RE.test(color)) {
    throw httpError(400, "color invalido (formato esperado #RRGGBB)");
  }

  const normalized = color.toLowerCase();

  const { error: upErr } = await supabase
    .from("historial_colores")
    .upsert({ color: normalized, used_at: new Date().toISOString() }, { onConflict: "color" });

  if (upErr) throw httpError(500, upErr.message);

  const { data: allRows, error: listErr } = await supabase
    .from("historial_colores")
    .select("color, used_at")
    .order("used_at", { ascending: false });

  if (listErr) throw httpError(500, listErr.message);

  if (allRows && allRows.length > HISTORIAL_COLORES_MAX) {
    const toDelete = allRows.slice(HISTORIAL_COLORES_MAX).map((r) => r.color);
    const { error: delErr } = await supabase
      .from("historial_colores")
      .delete()
      .in("color", toDelete);
    if (delErr) throw httpError(500, delErr.message);
  }

  return { color: normalized };
}

// =====================================================
// USUARIOS
// =====================================================

function sanitizePermissions(permissions) {
  const clean = {};
  if (!permissions || typeof permissions !== "object") {
    for (const key of PERMISSION_KEYS) clean[key] = false;
    return clean;
  }
  for (const key of PERMISSION_KEYS) {
    clean[key] = Boolean(permissions[key]);
  }
  return clean;
}

async function listUsuarios() {
  requireClient();

  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .order("id_usuario", { ascending: true });

  if (error) throw httpError(500, error.message);
  return (data || []).map(mapUsuarioRow);
}

async function findUsuarioByEmail(email) {
  requireClient();
  if (typeof email !== "string" || !email.trim()) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .ilike("email", email.trim())
    .maybeSingle();

  if (error) throw httpError(500, error.message);
  return data;
}

async function createUsuario({ email, password, permissions }) {
  requireClient();

  if (typeof email !== "string" || !email.trim()) {
    throw httpError(400, "email es requerido");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw httpError(400, "password debe tener al menos 6 caracteres");
  }

  const cleanPerms = sanitizePermissions(permissions);
  const password_hash = bcrypt.hashSync(password, 10);

  const insertRow = {
    email: email.trim(),
    password_hash,
    ...cleanPerms,
  };

  const { data, error } = await supabase.from("usuarios").insert(insertRow).select().single();

  if (error) {
    if (error.code === "23505") {
      throw httpError(409, "Ya existe un usuario con ese email");
    }
    throw httpError(500, error.message);
  }
  return mapUsuarioRow(data);
}

async function updateUsuario(id, { email, password, permissions }) {
  requireClient();

  const intId = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isInteger(intId)) throw httpError(400, "id de usuario invalido");

  const updateRow = {};

  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) {
      throw httpError(400, "email no puede estar vacio");
    }
    updateRow.email = email.trim();
  }

  if (password !== undefined && password !== null && password !== "") {
    if (typeof password !== "string" || password.length < 6) {
      throw httpError(400, "password debe tener al menos 6 caracteres");
    }
    updateRow.password_hash = bcrypt.hashSync(password, 10);
  }

  if (permissions !== undefined) {
    Object.assign(updateRow, sanitizePermissions(permissions));
  }

  if (Object.keys(updateRow).length === 0) {
    throw httpError(400, "Nada que actualizar");
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update(updateRow)
    .eq("id_usuario", intId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw httpError(409, "Ya existe un usuario con ese email");
    }
    throw httpError(500, error.message);
  }
  if (!data) throw httpError(404, "Usuario no encontrado");
  return mapUsuarioRow(data);
}

async function deleteUsuario(id) {
  requireClient();

  const intId = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isInteger(intId)) throw httpError(400, "id de usuario invalido");

  const { error } = await supabase.from("usuarios").delete().eq("id_usuario", intId);
  if (error) throw httpError(500, error.message);

  return { deleted: true };
}

async function verifyUsuarioPassword(email, password) {
  const row = await findUsuarioByEmail(email);
  if (!row) return null;

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return null;

  return mapUsuarioRow(row);
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  isSupabaseEnabled,
  loadSupabaseData,
  createCategory,
  updateCategory,
  deleteCategory,
  createImagenAsset,
  deleteImagenAsset,
  createModeloAsset,
  createItem,
  updateItem,
  deleteItem,
  listColorHistorial,
  pushColorToHistorial,
  PERMISSION_KEYS,
  listUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  verifyUsuarioPassword,
};
