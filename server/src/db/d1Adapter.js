// =============================================================================
// db/d1Adapter.js  —  ADAPTADOR D1 (SQLite, Cloudflare)
// =============================================================================
// Implementa el MISMO contrato que db/postgresAdapter.js (db/adapter.js), pero
// hablando con Cloudflare D1 (SQLite) via su binding nativo.
//
// COMO RECIBE EL BINDING:
//   D1 y R2 viven en `env` del worker (no en process.env). El worker, en cada
//   request, deja el binding en globalThis.__D1 antes de delegar en Hono. Este
//   adaptador lo lee desde ahi (lazy, por request). Asi mantenemos la misma
//   firma de funciones que el adaptador Postgres (sin pasar `env` por todos
//   lados) y el resto del proyecto no cambia.
//
// DIFERENCIAS SQLite vs Postgres que resuelve este archivo:
//   - ingredientes: en BD es TEXT con un JSON array; aca se serializa al
//     escribir (JSON.stringify) y se parsea al leer (JSON.parse).
//   - fechas (descuento_inicio/fin, used_at, creado_en): TEXT ISO 8601. Lo que
//     en Postgres hacia now() aca lo pone el adaptador con new Date().toISOString().
//   - booleans de permisos: INTEGER 0/1; se castean con Boolean()/Number().
//   - validacion de color hex: SQLite no trae regex, se valida en JS.
//   - upsert del historial: ON CONFLICT(color) DO UPDATE (SQLite lo soporta).
//
// IMPORTANTE: este modulo es ESM puro (import/export). Solo lo usa el worker.
// No comparte runtime con el adaptador Postgres (que es CommonJS para Node).
// =============================================================================

import bcrypt from "bcryptjs";

const PERMISSION_KEYS = [
  "puede_crear_platos",
  "puede_editar_platos",
  "puede_eliminar_platos",
  "puede_gestionar_categorias",
  "puede_subir_archivos",
  "puede_eliminar_archivos",
  "puede_gestionar_usuarios",
];

const HISTORIAL_COLORES_MAX = 8;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// -----------------------------------------------------------------------------
// BINDING D1 (lazy, por request)
// -----------------------------------------------------------------------------
function getDb() {
  return globalThis.__D1 || null;
}
function requireDb() {
  const db = getDb();
  if (!db) throw httpError(503, "D1 no esta configurado (falta el binding DB)");
  return db;
}

// -----------------------------------------------------------------------------
// HELPERS DE ID  (string del frontend  <->  int de la BD)  — identicos a Postgres
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// SERIALIZACION ESPECIFICA DE SQLITE
// -----------------------------------------------------------------------------
function parseIngredientes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function serializeIngredientes(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

// -----------------------------------------------------------------------------
// DESCUENTOS  (misma logica que el adaptador Postgres)
// -----------------------------------------------------------------------------
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
function roundTo990(raw) {
  if (raw < 990) return Math.max(0, Math.round(raw));
  const rounded = Math.floor(raw / 1000) * 1000 + 990;
  return rounded > raw ? rounded - 1000 : rounded;
}

// -----------------------------------------------------------------------------
// MAPEOS BD -> FRONTEND  (mismos shapes que Postgres)
// -----------------------------------------------------------------------------
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
    ingredients: parseIngredientes(row.ingredientes),
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
  for (const key of PERMISSION_KEYS) permissions[key] = Boolean(row[key]);
  return {
    id: row.id_usuario,
    email: row.email,
    permissions,
    createdAt: row.creado_en,
  };
}

// =============================================================================
// LOAD ALL DATA
// =============================================================================
async function loadData() {
  const db = requireDb();

  const [cats, imgs, mods, items] = await Promise.all([
    db.prepare("SELECT * FROM categorias ORDER BY id_categ").all(),
    db.prepare("SELECT * FROM imagenes ORDER BY id_image").all(),
    db.prepare("SELECT * FROM modelos ORDER BY id_model").all(),
    db.prepare("SELECT * FROM platos ORDER BY id").all(),
  ]);

  const catRows = cats.results || [];
  const imgRows = imgs.results || [];
  const modRows = mods.results || [];
  const itemRows = items.results || [];

  const categories = catRows.map(mapCategoryRow);
  const imagenes = imgRows.map(mapImagenRow);
  const modelos = modRows.map(mapModeloRow);

  const categoriesById = new Map(catRows.map((r) => [r.id_categ, mapCategoryRow(r)]));
  const imagenesById = new Map(imgRows.map((r) => [r.id_image, mapImagenRow(r)]));
  const modelosById = new Map(modRows.map((r) => [r.id_model, mapModeloRow(r)]));

  const menuItems = itemRows.map((row) =>
    mapItemRow(row, { categoriesById, imagenesById, modelosById }),
  );

  return { categories, imagenes, modelos, menuItems };
}

async function reloadAndFindItem(rawId) {
  const all = await loadData();
  return all.menuItems.find((i) => i.id === formatItemId(rawId)) || null;
}

function pushColorBackground(cardColor) {
  if (cardColor && HEX_COLOR_RE.test(cardColor)) {
    pushColorToHistorial(cardColor).catch(() => {});
  }
}

// =============================================================================
// CATEGORIES
// =============================================================================
async function createCategory({ label }) {
  const db = requireDb();
  const row = await db
    .prepare("INSERT INTO categorias (nombre_categ) VALUES (?) RETURNING *")
    .bind(label)
    .first();
  return mapCategoryRow(row);
}

async function updateCategory(stringId, { label }) {
  const db = requireDb();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de categoria invalido");

  const row = await db
    .prepare("UPDATE categorias SET nombre_categ = ? WHERE id_categ = ? RETURNING *")
    .bind(label, intId)
    .first();
  if (!row) throw httpError(404, "Categoria no encontrada");
  return mapCategoryRow(row);
}

async function deleteCategory(stringId) {
  const db = requireDb();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de categoria invalido");

  // Borrado explicito de platos (no dependemos de que el PRAGMA FK este activo).
  await db.prepare("DELETE FROM platos WHERE categoria = ?").bind(intId).run();
  await db.prepare("DELETE FROM categorias WHERE id_categ = ?").bind(intId).run();
  return { deleted: true };
}

// =============================================================================
// IMAGENES
// =============================================================================
async function createImagenAsset({ label, url }) {
  const db = requireDb();
  const row = await db
    .prepare("INSERT INTO imagenes (nombre_image, url_image) VALUES (?, ?) RETURNING *")
    .bind(label, url)
    .first();
  return mapImagenRow(row);
}

async function deleteImagenAsset(stringId) {
  const db = requireDb();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de imagen invalido");

  const existing = await db
    .prepare("SELECT url_image FROM imagenes WHERE id_image = ?")
    .bind(intId)
    .first();
  if (!existing) throw httpError(404, "Imagen no encontrada");

  await db.prepare("UPDATE platos SET imagen = NULL WHERE imagen = ?").bind(intId).run();
  await db.prepare("DELETE FROM imagenes WHERE id_image = ?").bind(intId).run();

  return { deleted: true, url: existing.url_image };
}

// =============================================================================
// MODELOS
// =============================================================================
async function createModeloAsset({ label, url }) {
  const db = requireDb();
  const row = await db
    .prepare("INSERT INTO modelos (nombre_model, url_model) VALUES (?, ?) RETURNING *")
    .bind(label, url)
    .first();
  return mapModeloRow(row);
}

async function deleteModeloAsset(stringId) {
  const db = requireDb();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de modelo invalido");

  const existing = await db
    .prepare("SELECT url_model FROM modelos WHERE id_model = ?")
    .bind(intId)
    .first();
  if (!existing) throw httpError(404, "Modelo no encontrado");

  await db.prepare("UPDATE platos SET modelo = NULL WHERE modelo = ?").bind(intId).run();
  await db.prepare("DELETE FROM modelos WHERE id_model = ?").bind(intId).run();

  return { deleted: true, url: existing.url_model };
}

// =============================================================================
// ITEMS (PLATOS)
// =============================================================================
async function resolveItemFks({ category, image, modelAR }) {
  const db = requireDb();
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
      const row = await db
        .prepare("SELECT id_image FROM imagenes WHERE url_image = ?")
        .bind(image)
        .first();
      if (!row) throw httpError(400, "Imagen no registrada en BD");
      result.imagen = row.id_image;
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
  const db = requireDb();

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

  const desc = buildDescuentoPayload({
    descuento: descuento === undefined ? 0 : descuento,
    descuentoInicio,
    descuentoFin,
  });

  const finalCardColor = cardColor || "#152238";
  const finalCardMessage = cardMessage && cardMessage.trim() ? cardMessage.trim() : null;

  const row = await db
    .prepare(
      `INSERT INTO platos (
         nombre, descripcion, precio, categoria, imagen, modelo,
         ingredientes, cardColor, cardMessage,
         descuento, descuento_inicio, descuento_fin
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      name,
      description || "",
      priceInt,
      fks.categoria,
      fks.imagen ?? null,
      fks.modelo ?? null,
      serializeIngredientes(ingredients),
      finalCardColor,
      finalCardMessage,
      desc.descuento ?? 0,
      desc.descuento_inicio ?? null,
      desc.descuento_fin ?? null,
    )
    .first();

  pushColorBackground(finalCardColor);
  return reloadAndFindItem(row.id);
}

async function updateItem(stringId, payload) {
  const db = requireDb();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de plato invalido");

  // SET dinamico: columnas y valores en paralelo.
  const cols = [];
  const vals = [];
  const set = (col, val) => {
    cols.push(`${col} = ?`);
    vals.push(val);
  };

  if (payload.name !== undefined) set("nombre", payload.name);
  if (payload.description !== undefined) set("descripcion", payload.description || "");
  if (payload.price !== undefined) {
    const priceInt = parseInt(String(payload.price).replace(/[^\d]/g, ""), 10);
    if (Number.isNaN(priceInt)) throw httpError(400, "precio invalido");
    set("precio", priceInt);
  }
  if (payload.ingredients !== undefined) {
    set("ingredientes", serializeIngredientes(payload.ingredients));
  }
  let pushColor = null;
  if (payload.cardColor !== undefined) {
    const c = payload.cardColor || "#152238";
    set("cardColor", c);
    pushColor = c;
  }
  if (payload.cardMessage !== undefined) {
    set(
      "cardMessage",
      payload.cardMessage && String(payload.cardMessage).trim()
        ? String(payload.cardMessage).trim()
        : null,
    );
  }

  const desc = buildDescuentoPayload({
    descuento: payload.descuento,
    descuentoInicio: payload.descuentoInicio,
    descuentoFin: payload.descuentoFin,
  });
  if (desc.descuento !== undefined) set("descuento", desc.descuento);
  if (desc.descuento_inicio !== undefined) set("descuento_inicio", desc.descuento_inicio);
  if (desc.descuento_fin !== undefined) set("descuento_fin", desc.descuento_fin);

  const fks = await resolveItemFks({
    category: payload.category,
    image: payload.image,
    modelAR: payload.modelAR,
  });
  if (fks.categoria !== undefined) set("categoria", fks.categoria);
  if (fks.imagen !== undefined) set("imagen", fks.imagen);
  if (fks.modelo !== undefined) set("modelo", fks.modelo);

  if (cols.length === 0) throw httpError(400, "Nada que actualizar");

  vals.push(intId);
  const row = await db
    .prepare(`UPDATE platos SET ${cols.join(", ")} WHERE id = ? RETURNING id`)
    .bind(...vals)
    .first();
  if (!row) throw httpError(404, "Plato no encontrado");

  if (pushColor) pushColorBackground(pushColor);
  return reloadAndFindItem(row.id);
}

async function deleteItem(stringId) {
  const db = requireDb();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de plato invalido");

  await db.prepare("DELETE FROM platos WHERE id = ?").bind(intId).run();
  return { deleted: true };
}

// =============================================================================
// HISTORIAL DE COLORES
// =============================================================================
async function listColorHistorial() {
  const db = requireDb();
  const res = await db
    .prepare("SELECT color FROM historial_colores ORDER BY used_at DESC LIMIT ?")
    .bind(HISTORIAL_COLORES_MAX)
    .all();
  return (res.results || []).map((r) => r.color);
}

async function pushColorToHistorial(color) {
  const db = requireDb();
  if (typeof color !== "string" || !HEX_COLOR_RE.test(color)) {
    throw httpError(400, "color invalido (formato esperado #RRGGBB)");
  }
  const normalized = color.toLowerCase();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO historial_colores (color, used_at) VALUES (?, ?)
       ON CONFLICT(color) DO UPDATE SET used_at = excluded.used_at`,
    )
    .bind(normalized, nowIso)
    .run();

  const all = await db.prepare("SELECT color FROM historial_colores ORDER BY used_at DESC").all();
  const rows = all.results || [];
  if (rows.length > HISTORIAL_COLORES_MAX) {
    const toDelete = rows.slice(HISTORIAL_COLORES_MAX).map((r) => r.color);
    const placeholders = toDelete.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM historial_colores WHERE color IN (${placeholders})`)
      .bind(...toDelete)
      .run();
  }

  return { color: normalized };
}

// =============================================================================
// USUARIOS
// =============================================================================
function sanitizePermissions(permissions) {
  const clean = {};
  if (!permissions || typeof permissions !== "object") {
    for (const key of PERMISSION_KEYS) clean[key] = false;
    return clean;
  }
  for (const key of PERMISSION_KEYS) clean[key] = Boolean(permissions[key]);
  return clean;
}

async function listUsuarios() {
  const db = requireDb();
  const res = await db.prepare("SELECT * FROM usuarios ORDER BY id_usuario ASC").all();
  return (res.results || []).map(mapUsuarioRow);
}

async function findUsuarioByEmail(email) {
  const db = requireDb();
  if (typeof email !== "string" || !email.trim()) return null;
  const row = await db
    .prepare("SELECT * FROM usuarios WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email.trim())
    .first();
  return row || null;
}

async function createUsuario({ email, password, permissions }) {
  const db = requireDb();

  if (typeof email !== "string" || !email.trim()) throw httpError(400, "email es requerido");
  if (typeof password !== "string" || password.length < 6) {
    throw httpError(400, "password debe tener al menos 6 caracteres");
  }

  const perms = sanitizePermissions(permissions);
  const password_hash = bcrypt.hashSync(password, 10);
  const nowIso = new Date().toISOString();

  try {
    const row = await db
      .prepare(
        `INSERT INTO usuarios (
           email, password_hash,
           puede_crear_platos, puede_editar_platos, puede_eliminar_platos,
           puede_gestionar_categorias, puede_subir_archivos,
           puede_eliminar_archivos, puede_gestionar_usuarios, creado_en
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        email.trim(),
        password_hash,
        perms.puede_crear_platos ? 1 : 0,
        perms.puede_editar_platos ? 1 : 0,
        perms.puede_eliminar_platos ? 1 : 0,
        perms.puede_gestionar_categorias ? 1 : 0,
        perms.puede_subir_archivos ? 1 : 0,
        perms.puede_eliminar_archivos ? 1 : 0,
        perms.puede_gestionar_usuarios ? 1 : 0,
        nowIso,
      )
      .first();
    return mapUsuarioRow(row);
  } catch (err) {
    if (/UNIQUE/i.test(err.message || "")) {
      throw httpError(409, "Ya existe un usuario con ese email");
    }
    throw httpError(500, err.message);
  }
}

async function updateUsuario(id, { email, password, permissions }) {
  const db = requireDb();
  const intId = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isInteger(intId)) throw httpError(400, "id de usuario invalido");

  const cols = [];
  const vals = [];
  const set = (col, val) => {
    cols.push(`${col} = ?`);
    vals.push(val);
  };

  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) {
      throw httpError(400, "email no puede estar vacio");
    }
    set("email", email.trim());
  }
  if (password !== undefined && password !== null && password !== "") {
    if (typeof password !== "string" || password.length < 6) {
      throw httpError(400, "password debe tener al menos 6 caracteres");
    }
    set("password_hash", bcrypt.hashSync(password, 10));
  }
  if (permissions !== undefined) {
    const perms = sanitizePermissions(permissions);
    for (const key of PERMISSION_KEYS) set(key, perms[key] ? 1 : 0);
  }

  if (cols.length === 0) throw httpError(400, "Nada que actualizar");

  vals.push(intId);
  try {
    const row = await db
      .prepare(`UPDATE usuarios SET ${cols.join(", ")} WHERE id_usuario = ? RETURNING *`)
      .bind(...vals)
      .first();
    if (!row) throw httpError(404, "Usuario no encontrado");
    return mapUsuarioRow(row);
  } catch (err) {
    if (/UNIQUE/i.test(err.message || "")) {
      throw httpError(409, "Ya existe un usuario con ese email");
    }
    if (err.status) throw err;
    throw httpError(500, err.message);
  }
}

async function deleteUsuario(id) {
  const db = requireDb();
  const intId = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isInteger(intId)) throw httpError(400, "id de usuario invalido");

  await db.prepare("DELETE FROM usuarios WHERE id_usuario = ?").bind(intId).run();
  return { deleted: true };
}

async function verifyUsuarioPassword(email, password) {
  const row = await findUsuarioByEmail(email);
  if (!row) return null;
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return null;
  return mapUsuarioRow(row);
}

// =============================================================================
// EXPORT: objeto adaptador (cumple el contrato de db/adapter.js)
// =============================================================================
const d1Adapter = {
  __name: "d1",
  loadData,
  createCategory,
  updateCategory,
  deleteCategory,
  createImagenAsset,
  deleteImagenAsset,
  createModeloAsset,
  deleteModeloAsset,
  createItem,
  updateItem,
  deleteItem,
  listColorHistorial,
  pushColorToHistorial,
  listUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  verifyUsuarioPassword,
};

export default d1Adapter;
export { PERMISSION_KEYS, HISTORIAL_COLORES_MAX, HEX_COLOR_RE };
