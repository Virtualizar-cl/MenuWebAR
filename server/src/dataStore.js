// =============================================================================
// dataStore.js  —  ORQUESTADOR DE LA CAPA DE DATOS (con cache)
// =============================================================================
// Reemplaza el rol que antes tenia supabaseStore.js. NO sabe de ningun motor:
//   1. Elige el adaptador correcto segun el entorno (por ahora: Postgres).
//   2. Valida que el adaptador cumpla el contrato (db/adapter.js).
//   3. Cachea loadData en memoria por unos segundos y de-duplica las llamadas
//      concurrentes, para no saturar el pooler de Supabase (plan free aguanta
//      pocas conexiones). Esto elimina los cuelgues intermitentes cuando el
//      frontend dispara varias peticiones a la vez (categories + menu-items...).
//   4. Reexpone los mismos nombres que server.js ya importaba + storage.
//
// COMO FUNCIONA EL CACHE:
//   - loadData cachea el resultado DATA_TTL_MS milisegundos.
//   - Si llegan varias peticiones a la vez y el cache esta frio, solo UNA pega
//     a la BD; las demas esperan esa misma promesa (dedupe). Asi 4 requests
//     concurrentes = 1 viaje a la BD, no 4.
//   - Cualquier escritura (create/update/delete) invalida el cache para que el
//     siguiente loadData traiga datos frescos.
// =============================================================================

const { assertImplementsAdapter, PERMISSION_KEYS } = require("./db/adapter");
const postgresAdapter = require("./db/postgresAdapter");
const storage = require("./storage/blobStorage");

// Cuanto dura el cache de loadData. 10s es suficiente para absorber la rafaga
// de peticiones del frontend al cargar, sin que los datos se vean "viejos".
const DATA_TTL_MS = Number(process.env.DATA_CACHE_TTL_MS || 10000);

// -----------------------------------------------------------------------------
// Seleccion de adaptador (lazy + cacheado)
// -----------------------------------------------------------------------------
let _adapter = null;

function selectAdapter() {
  if (_adapter) return _adapter;
  if (process.env.DATABASE_URL) {
    _adapter = assertImplementsAdapter(postgresAdapter, "postgresAdapter");
    return _adapter;
  }
  return null;
}

function requireAdapter() {
  const a = selectAdapter();
  if (!a) {
    const err = new Error(
      "Base de datos no configurada. Define DATABASE_URL (Postgres: Supabase o Neon).",
    );
    err.status = 503;
    throw err;
  }
  return a;
}

// -----------------------------------------------------------------------------
// CACHE + DEDUPE de loadData
// -----------------------------------------------------------------------------
let _cache = null; // { data, expires }
let _inflight = null; // promesa en curso, para de-duplicar concurrencia

function invalidateCache() {
  _cache = null;
}

async function loadDataCached() {
  const now = Date.now();

  // 1) Cache caliente -> devolver al toque, sin tocar la BD.
  if (_cache && _cache.expires > now) {
    return _cache.data;
  }

  // 2) Ya hay una carga en curso -> reusar esa misma promesa (dedupe). Esto
  //    evita que 4 peticiones concurrentes abran 4 cargas a la vez.
  if (_inflight) {
    return _inflight;
  }

  // 3) Cache frio y nadie cargando -> cargar una vez.
  _inflight = (async () => {
    try {
      const data = await requireAdapter().loadData();
      _cache = { data, expires: Date.now() + DATA_TTL_MS };
      return data;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

// -----------------------------------------------------------------------------
// Wrappers de ESCRITURA: delegan en el adaptador y luego invalidan el cache,
// para que el proximo loadData traiga datos frescos.
// -----------------------------------------------------------------------------
async function withInvalidate(promise) {
  const result = await promise;
  invalidateCache();
  return result;
}

const createCategory = (...a) => withInvalidate(requireAdapter().createCategory(...a));
const updateCategory = (...a) => withInvalidate(requireAdapter().updateCategory(...a));
const deleteCategory = (...a) => withInvalidate(requireAdapter().deleteCategory(...a));

const createImagenAsset = (...a) => withInvalidate(requireAdapter().createImagenAsset(...a));
const deleteImagenAsset = (...a) => withInvalidate(requireAdapter().deleteImagenAsset(...a));

const createModeloAsset = (...a) => withInvalidate(requireAdapter().createModeloAsset(...a));
const deleteModeloAsset = (...a) => withInvalidate(requireAdapter().deleteModeloAsset(...a));

const createItem = (...a) => withInvalidate(requireAdapter().createItem(...a));
const updateItem = (...a) => withInvalidate(requireAdapter().updateItem(...a));
const deleteItem = (...a) => withInvalidate(requireAdapter().deleteItem(...a));

// Historial: el push tambien invalida (cambia datos consultables).
const listColorHistorial = (...a) => requireAdapter().listColorHistorial(...a);
const pushColorToHistorial = (...a) => withInvalidate(requireAdapter().pushColorToHistorial(...a));

// Usuarios: no afectan loadData (no entran al menu), pero invalidamos igual por
// prolijidad en create/update/delete; el verify y list son lectura directa.
const listUsuarios = (...a) => requireAdapter().listUsuarios(...a);
const createUsuario = (...a) => withInvalidate(requireAdapter().createUsuario(...a));
const updateUsuario = (...a) => withInvalidate(requireAdapter().updateUsuario(...a));
const deleteUsuario = (...a) => withInvalidate(requireAdapter().deleteUsuario(...a));
const verifyUsuarioPassword = (...a) => requireAdapter().verifyUsuarioPassword(...a);

// -----------------------------------------------------------------------------
// FLAGS (getters, se reevaluan en cada acceso porque en serverless process.env
// se puebla en runtime)
// -----------------------------------------------------------------------------
Object.defineProperty(module.exports, "isDataStoreEnabled", {
  enumerable: true,
  get() {
    return Boolean(selectAdapter());
  },
});
Object.defineProperty(module.exports, "isSupabaseEnabled", {
  enumerable: true,
  get() {
    return Boolean(selectAdapter());
  },
});

// -----------------------------------------------------------------------------
// EXPORTS: misma superficie que el server consumia de supabaseStore + storage.
// -----------------------------------------------------------------------------
Object.assign(module.exports, {
  PERMISSION_KEYS,

  // datos (lectura cacheada)
  loadSupabaseData: loadDataCached, // alias historico
  loadData: loadDataCached,
  invalidateCache,

  // escrituras (invalidan cache)
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

  // storage
  uploadFileToStorage: storage.uploadFileToStorage,
  deleteStorageFile: storage.deleteStorageFile,
  isSupabaseStorageUrl: storage.isManagedStorageUrl,
  isManagedStorageUrl: storage.isManagedStorageUrl,
});