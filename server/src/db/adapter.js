// =============================================================================
// db/adapter.js  —  CONTRATO DE LA CAPA DE DATOS
// =============================================================================
// Este archivo NO contiene logica de base de datos. Define el "contrato": la
// lista de metodos que CUALQUIER adaptador (Postgres, D1, etc.) tiene que
// implementar para que el resto del proyecto (server.js, worker.js) funcione
// sin saber que motor hay debajo.
//
// La idea es la siguiente:
//   - server.js / worker.js  ->  hablan con dataStore.js
//   - dataStore.js           ->  elige un adaptador segun el entorno
//   - adaptador (este shape) ->  habla con el motor real (Postgres / D1)
//
// Asi, el dia que cambias de Supabase Postgres a Vercel Postgres (Neon), o de
// Neon a D1, NO tocas la logica de negocio: solo enchufas otro adaptador que
// cumpla este mismo contrato.
//
// Todos los metodos devuelven datos ya MAPEADOS al formato que espera el
// frontend (ids tipo "item-12", "cat-bebidas", arrays de ingredientes, etc.).
// El mapeo BD->frontend es responsabilidad de cada adaptador, porque cada
// motor guarda las cosas distinto (Postgres usa text[], SQLite usa JSON, etc.).
//
// IMPORTANTE: este archivo se puede importar tanto en Node (CommonJS, via
// require) como en el worker de Cloudflare (ESM, via import) porque solo
// exporta constantes y una funcion de validacion sin dependencias externas.
// =============================================================================

// Lista canonica de permisos. Vive aca (y no en un adaptador concreto) porque
// es identica para todos los motores: es parte del dominio del negocio, no de
// la base de datos.
const PERMISSION_KEYS = [
  "puede_crear_platos",
  "puede_editar_platos",
  "puede_eliminar_platos",
  "puede_gestionar_categorias",
  "puede_subir_archivos",
  "puede_eliminar_archivos",
  "puede_gestionar_usuarios",
];

// Maximo de colores que guardamos en el historial de la marca.
const HISTORIAL_COLORES_MAX = 8;

// Regex de color hex #RRGGBB. Se usa en validaciones de varios adaptadores.
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// -----------------------------------------------------------------------------
// CONTRATO: estos son los metodos que un adaptador DEBE exponer.
// -----------------------------------------------------------------------------
// Lo dejamos como lista de nombres para poder validar en runtime (abajo) que
// un objeto cumple el contrato antes de usarlo. Si algun dia agregas un metodo
// nuevo al dominio, lo sumas aca y la validacion te avisa que adaptador quedo
// incompleto.
const REQUIRED_METHODS = [
  // lectura global
  "loadData", // () -> { categories, imagenes, modelos, menuItems }
  // categorias
  "createCategory", // ({ label }) -> category
  "updateCategory", // (id, { label }) -> category
  "deleteCategory", // (id) -> { deleted: true }
  // imagenes (registro en BD; el archivo fisico lo maneja la capa de storage)
  "createImagenAsset", // ({ label, url }) -> imagen
  "deleteImagenAsset", // (id) -> { deleted, url }
  // modelos
  "createModeloAsset", // ({ label, url }) -> modelo
  "deleteModeloAsset", // (id) -> { deleted, url }
  // platos
  "createItem", // (payload) -> item
  "updateItem", // (id, payload) -> item
  "deleteItem", // (id) -> { deleted: true }
  // historial de colores
  "listColorHistorial", // () -> string[]
  "pushColorToHistorial", // (color) -> { color }
  // usuarios
  "listUsuarios", // () -> usuario[]
  "createUsuario", // ({ email, password, permissions }) -> usuario
  "updateUsuario", // (id, { email, password, permissions }) -> usuario
  "deleteUsuario", // (id) -> { deleted: true }
  "verifyUsuarioPassword", // (email, password) -> usuario | null
];

// Valida que `candidate` implemente todos los metodos del contrato. Lanza un
// Error claro si falta alguno. dataStore.js llama a esto al construir el
// adaptador, asi un adaptador a medio escribir falla rapido y con un mensaje
// entendible en vez de tirar "undefined is not a function" en produccion.
function assertImplementsAdapter(candidate, adapterName = "adapter") {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`[adapter] ${adapterName} no es un objeto valido`);
  }
  const missing = REQUIRED_METHODS.filter((m) => typeof candidate[m] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `[adapter] ${adapterName} no cumple el contrato. Faltan metodos: ${missing.join(", ")}`,
    );
  }
  return candidate;
}

// Helper compartido para construir errores HTTP con .status. Lo reexportamos
// desde aca para que todos los adaptadores tiren errores con la misma forma y
// el backend los traduzca igual (ver handleSupabaseRouteError / routeError).
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = {
  PERMISSION_KEYS,
  HISTORIAL_COLORES_MAX,
  HEX_COLOR_RE,
  REQUIRED_METHODS,
  assertImplementsAdapter,
  httpError,
};
