// =============================================================================
// db/postgresAdapter.js  —  ADAPTADOR POSTGRES
// =============================================================================
// Implementa el contrato de db/adapter.js contra una base Postgres, hablando
// por SQL directo con el driver `postgres` (https://github.com/porsager/postgres).
//
// POR QUE SQL DIRECTO Y NO @supabase/supabase-js:
//   El SDK de Supabase te ata a Supabase. Como el objetivo del proyecto es
//   poder mover la BD "dentro de Vercel" (Vercel Postgres = Neon) sin reescribir
//   nada, usamos un connection string puro. El MISMO codigo de este archivo
//   sirve para:
//     - Supabase Postgres  (lo que usas hoy)
//     - Vercel Postgres / Neon (a donde quieras migrar despues)
//     - cualquier otro Postgres
//   Solo cambias la variable de entorno DATABASE_URL. El codigo no se toca.
//
// COMO OBTENER EL connection string EN SUPABASE:
//   Dashboard -> Project Settings -> Database -> Connection string -> "URI".
//   Usa el string del **Connection Pooler** (puerto 6543, modo "Transaction")
//   si vas a desplegar en serverless (Vercel). Para conexion directa/local
//   sirve el puerto 5432.
//
// ESQUEMA:
//   Este adaptador asume EXACTAMENTE el mismo esquema que ya tienes en Supabase
//   (tablas categorias, imagenes, modelos, platos, historial_colores, usuarios).
//   No cambia nombres de columnas ni tipos. Por eso puedes apuntarlo a tu
//   Supabase actual y funciona sin migrar datos.
// =============================================================================

const bcrypt = require("bcryptjs");
const postgres = require("postgres");

const {
  PERMISSION_KEYS,
  HISTORIAL_COLORES_MAX,
  HEX_COLOR_RE,
  httpError,
} = require("./adapter");

// -----------------------------------------------------------------------------
// CONEXION (lazy singleton)
// -----------------------------------------------------------------------------
// Igual que el cliente de Supabase original, creamos la conexion la primera vez
// que se necesita, no al importar el modulo. Esto importa en serverless porque
// process.env puede no estar poblado en import time.
let _sql = null;

function getSql() {
  if (_sql) return _sql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  _sql = postgres(connectionString, {
    // En serverless conviene poco pooling por instancia; el pooler de Supabase/
    // Neon ya agrupa del lado servidor. max:1 evita abrir muchas conexiones.
    max: Number(process.env.PG_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase/Neon requieren SSL. 'require' funciona en ambos.
    ssl: "require",
    // CRITICO: el pooler de Supabase en modo transaction (puerto 6543, el que
    // trae ?pgbouncer=true) NO soporta prepared statements. El driver `postgres`
    // los usa por defecto, lo que rompe cualquier query. Hay que desactivarlos.
    // Detectamos el pooler por el puerto 6543 o el flag pgbouncer en la URL.
    prepare: !/6543|pgbouncer=true/.test(connectionString),
    // Silenciamos los notices para no ensuciar logs.
    onnotice: () => {},
  });
  return _sql;
}

function requireSql() {
  const sql = getSql();
  if (!sql) {
    throw httpError(503, "Postgres no esta configurado (falta DATABASE_URL)");
  }
  return sql;
}

// -----------------------------------------------------------------------------
// HELPERS DE ID  (string del frontend  <->  int de la BD)
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
// DESCUENTOS  (misma logica que el store original)
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
// MAPEOS BD -> FRONTEND
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
  const sql = requireSql();

  const cats = await sql`select * from categorias order by id_categ`;
  const imgs = await sql`select * from imagenes order by id_image`;
  const mods = await sql`select * from modelos order by id_model`;
  const items = await sql`select * from platos order by id`;

  const categories = cats.map(mapCategoryRow);
  const imagenes = imgs.map(mapImagenRow);
  const modelos = mods.map(mapModeloRow);

  const categoriesById = new Map(cats.map((r) => [r.id_categ, mapCategoryRow(r)]));
  const imagenesById = new Map(imgs.map((r) => [r.id_image, mapImagenRow(r)]));
  const modelosById = new Map(mods.map((r) => [r.id_model, mapModeloRow(r)]));

  const menuItems = items.map((row) =>
    mapItemRow(row, { categoriesById, imagenesById, modelosById }),
  );

  return { categories, imagenes, modelos, menuItems };
}

async function reloadAndFindItem(rawId) {
  const all = await loadData();
  const found = all.menuItems.find((i) => i.id === formatItemId(rawId));
  return found || null;
}

// Empuja un color al historial (best-effort, no bloquea la operacion principal).
function pushColorBackground(cardColor) {
  if (cardColor && HEX_COLOR_RE.test(cardColor)) {
    pushColorToHistorial(cardColor).catch(() => {});
  }
}

// =============================================================================
// CATEGORIES
// =============================================================================
async function createCategory({ label }) {
  const sql = requireSql();
  const [row] = await sql`
    insert into categorias (nombre_categ) values (${label}) returning *
  `;
  return mapCategoryRow(row);
}

async function updateCategory(stringId, { label }) {
  const sql = requireSql();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de categoria invalido");

  const [row] = await sql`
    update categorias set nombre_categ = ${label}
    where id_categ = ${intId} returning *
  `;
  if (!row) throw httpError(404, "Categoria no encontrada");
  return mapCategoryRow(row);
}

async function deleteCategory(stringId) {
  const sql = requireSql();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de categoria invalido");

  // El esquema ya tiene ON DELETE CASCADE sobre platos.categoria, pero
  // borramos explicito por si el esquema en algun entorno no lo tuviera.
  await sql`delete from platos where categoria = ${intId}`;
  await sql`delete from categorias where id_categ = ${intId}`;
  return { deleted: true };
}

// =============================================================================
// IMAGENES  (registro en BD; el binario lo sube la capa de storage)
// =============================================================================
async function createImagenAsset({ label, url }) {
  const sql = requireSql();
  const [row] = await sql`
    insert into imagenes (nombre_image, url_image)
    values (${label}, ${url}) returning *
  `;
  return mapImagenRow(row);
}

async function deleteImagenAsset(stringId) {
  const sql = requireSql();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de imagen invalido");

  const [existing] = await sql`select url_image from imagenes where id_image = ${intId}`;
  if (!existing) throw httpError(404, "Imagen no encontrada");

  await sql`update platos set imagen = null where imagen = ${intId}`;
  await sql`delete from imagenes where id_image = ${intId}`;

  return { deleted: true, url: existing.url_image };
}

// =============================================================================
// MODELOS
// =============================================================================
async function createModeloAsset({ label, url }) {
  const sql = requireSql();
  const [row] = await sql`
    insert into modelos (nombre_model, url_model)
    values (${label}, ${url}) returning *
  `;
  return mapModeloRow(row);
}

async function deleteModeloAsset(stringId) {
  const sql = requireSql();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de modelo invalido");

  const [existing] = await sql`select url_model from modelos where id_model = ${intId}`;
  if (!existing) throw httpError(404, "Modelo no encontrado");

  await sql`update platos set modelo = null where modelo = ${intId}`;
  await sql`delete from modelos where id_model = ${intId}`;

  return { deleted: true, url: existing.url_model };
}

// =============================================================================
// ITEMS (PLATOS)
// =============================================================================
async function resolveItemFks({ category, image, modelAR }) {
  const sql = requireSql();
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
      const [row] = await sql`select id_image from imagenes where url_image = ${image}`;
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
  const sql = requireSql();

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
  const finalIngredients = Array.isArray(ingredients) ? ingredients : [];

  const [row] = await sql`
    insert into platos (
      nombre, descripcion, precio, categoria, imagen, modelo,
      ingredientes, "cardColor", "cardMessage",
      descuento, descuento_inicio, descuento_fin
    ) values (
      ${name},
      ${description || ""},
      ${priceInt},
      ${fks.categoria},
      ${fks.imagen ?? null},
      ${fks.modelo ?? null},
      ${finalIngredients},
      ${finalCardColor},
      ${finalCardMessage},
      ${desc.descuento ?? 0},
      ${desc.descuento_inicio ?? null},
      ${desc.descuento_fin ?? null}
    ) returning id
  `;

  pushColorBackground(finalCardColor);
  return reloadAndFindItem(row.id);
}

async function updateItem(stringId, payload) {
  const sql = requireSql();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de plato invalido");

  // Construimos el SET dinamicamente, solo con los campos que llegaron.
  const updates = {};

  if (payload.name !== undefined) updates.nombre = payload.name;
  if (payload.description !== undefined) updates.descripcion = payload.description || "";
  if (payload.price !== undefined) {
    const priceInt = parseInt(String(payload.price).replace(/[^\d]/g, ""), 10);
    if (Number.isNaN(priceInt)) throw httpError(400, "precio invalido");
    updates.precio = priceInt;
  }
  if (payload.ingredients !== undefined) {
    updates.ingredientes = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  }
  if (payload.cardColor !== undefined) {
    updates.cardColor = payload.cardColor || "#152238";
  }
  if (payload.cardMessage !== undefined) {
    updates.cardMessage =
      payload.cardMessage && String(payload.cardMessage).trim()
        ? String(payload.cardMessage).trim()
        : null;
  }

  const desc = buildDescuentoPayload({
    descuento: payload.descuento,
    descuentoInicio: payload.descuentoInicio,
    descuentoFin: payload.descuentoFin,
  });
  if (desc.descuento !== undefined) updates.descuento = desc.descuento;
  if (desc.descuento_inicio !== undefined) updates.descuento_inicio = desc.descuento_inicio;
  if (desc.descuento_fin !== undefined) updates.descuento_fin = desc.descuento_fin;

  const fks = await resolveItemFks({
    category: payload.category,
    image: payload.image,
    modelAR: payload.modelAR,
  });
  Object.assign(updates, fks);

  if (Object.keys(updates).length === 0) {
    throw httpError(400, "Nada que actualizar");
  }

  // sql(obj) genera "col1" = val1, "col2" = val2 ... respetando las comillas
  // de las columnas con mayuscula (cardColor, cardMessage).
  const [row] = await sql`
    update platos set ${sql(updates)} where id = ${intId} returning id
  `;
  if (!row) throw httpError(404, "Plato no encontrado");

  if (updates.cardColor) pushColorBackground(updates.cardColor);
  return reloadAndFindItem(row.id);
}

async function deleteItem(stringId) {
  const sql = requireSql();
  const intId = parseIntId(stringId);
  if (intId == null) throw httpError(400, "id de plato invalido");

  await sql`delete from platos where id = ${intId}`;
  return { deleted: true };
}

// =============================================================================
// HISTORIAL DE COLORES
// =============================================================================
async function listColorHistorial() {
  const sql = requireSql();
  const rows = await sql`
    select color from historial_colores
    order by used_at desc limit ${HISTORIAL_COLORES_MAX}
  `;
  return rows.map((r) => r.color);
}

async function pushColorToHistorial(color) {
  const sql = requireSql();
  if (typeof color !== "string" || !HEX_COLOR_RE.test(color)) {
    throw httpError(400, "color invalido (formato esperado #RRGGBB)");
  }
  const normalized = color.toLowerCase();

  await sql`
    insert into historial_colores (color, used_at)
    values (${normalized}, now())
    on conflict (color) do update set used_at = now()
  `;

  // Recortar a los HISTORIAL_COLORES_MAX mas recientes.
  const all = await sql`select color from historial_colores order by used_at desc`;
  if (all.length > HISTORIAL_COLORES_MAX) {
    const toDelete = all.slice(HISTORIAL_COLORES_MAX).map((r) => r.color);
    await sql`delete from historial_colores where color in ${sql(toDelete)}`;
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
  const sql = requireSql();
  const rows = await sql`select * from usuarios order by id_usuario asc`;
  return rows.map(mapUsuarioRow);
}

async function findUsuarioByEmail(email) {
  const sql = requireSql();
  if (typeof email !== "string" || !email.trim()) return null;
  const [row] = await sql`
    select * from usuarios where lower(email) = lower(${email.trim()}) limit 1
  `;
  return row || null;
}

async function createUsuario({ email, password, permissions }) {
  const sql = requireSql();

  if (typeof email !== "string" || !email.trim()) {
    throw httpError(400, "email es requerido");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw httpError(400, "password debe tener al menos 6 caracteres");
  }

  const perms = sanitizePermissions(permissions);
  const password_hash = bcrypt.hashSync(password, 10);

  try {
    const [row] = await sql`
      insert into usuarios (
        email, password_hash,
        puede_crear_platos, puede_editar_platos, puede_eliminar_platos,
        puede_gestionar_categorias, puede_subir_archivos,
        puede_eliminar_archivos, puede_gestionar_usuarios
      ) values (
        ${email.trim()}, ${password_hash},
        ${perms.puede_crear_platos}, ${perms.puede_editar_platos}, ${perms.puede_eliminar_platos},
        ${perms.puede_gestionar_categorias}, ${perms.puede_subir_archivos},
        ${perms.puede_eliminar_archivos}, ${perms.puede_gestionar_usuarios}
      ) returning *
    `;
    return mapUsuarioRow(row);
  } catch (err) {
    // 23505 = unique_violation en Postgres
    if (err && err.code === "23505") {
      throw httpError(409, "Ya existe un usuario con ese email");
    }
    throw httpError(500, err.message);
  }
}

async function updateUsuario(id, { email, password, permissions }) {
  const sql = requireSql();
  const intId = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isInteger(intId)) throw httpError(400, "id de usuario invalido");

  const updates = {};

  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) {
      throw httpError(400, "email no puede estar vacio");
    }
    updates.email = email.trim();
  }

  if (password !== undefined && password !== null && password !== "") {
    if (typeof password !== "string" || password.length < 6) {
      throw httpError(400, "password debe tener al menos 6 caracteres");
    }
    updates.password_hash = bcrypt.hashSync(password, 10);
  }

  if (permissions !== undefined) {
    Object.assign(updates, sanitizePermissions(permissions));
  }

  if (Object.keys(updates).length === 0) {
    throw httpError(400, "Nada que actualizar");
  }

  try {
    const [row] = await sql`
      update usuarios set ${sql(updates)} where id_usuario = ${intId} returning *
    `;
    if (!row) throw httpError(404, "Usuario no encontrado");
    return mapUsuarioRow(row);
  } catch (err) {
    if (err && err.code === "23505") {
      throw httpError(409, "Ya existe un usuario con ese email");
    }
    if (err.status) throw err;
    throw httpError(500, err.message);
  }
}

async function deleteUsuario(id) {
  const sql = requireSql();
  const intId = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isInteger(intId)) throw httpError(400, "id de usuario invalido");

  await sql`delete from usuarios where id_usuario = ${intId}`;
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
// EXPORT: el objeto adaptador que cumple el contrato de db/adapter.js
// =============================================================================
module.exports = {
  // marca para logs/debug
  __name: "postgres",
  // lectura
  loadData,
  // categorias
  createCategory,
  updateCategory,
  deleteCategory,
  // imagenes
  createImagenAsset,
  deleteImagenAsset,
  // modelos
  createModeloAsset,
  deleteModeloAsset,
  // platos
  createItem,
  updateItem,
  deleteItem,
  // historial
  listColorHistorial,
  pushColorToHistorial,
  // usuarios
  listUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  verifyUsuarioPassword,
};