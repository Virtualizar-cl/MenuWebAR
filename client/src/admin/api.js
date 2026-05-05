// Cliente HTTP del frontend. Todas las llamadas a la API pasan por aca.
// Asi el resto de los componentes no tienen que saber de fetch, headers,
// tokens, etc. Si mañana cambiamos de backend solo tocamos este archivo.

// En dev, Vite hace proxy de /api al backend en localhost:3001 (ver
// vite.config.js). En produccion el frontend y el backend estan en el mismo
// host, asi que /api apunta al mismo servidor.
import { ENV } from "../config/env";

const { API_URL } = ENV; // Busca la variable de entorno VITE_API_URL y si no, por defecto deja /api

// Arma los headers de cada request. Si hay token guardado en localStorage,
// lo agrega como Bearer para que el backend valide la sesion.
function getHeaders() {
  const token = localStorage.getItem("admin_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Helper privado: centraliza el patron fetch / check / throw / return que
// se repetia en cada funcion HTTP. Si la respuesta es !ok, intenta leer
// { error } del body y lanza Error con ese mensaje.
async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error en ${path}`);
  }
  return res.json();
}

// Atajos para los verbos HTTP mas comunes. Asi cada CRUD queda en una linea.
const get = (path) => request(path);
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const put = (path, id, body) =>
  request(`${path}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
const del = (path, id) => request(`${path}/${encodeURIComponent(id)}`, { method: "DELETE" });

// ---------- AUTENTICACION ----------

// Login. No usa request() porque tiene efectos secundarios (guardar token
// y permisos en localStorage) y no debe enviar Authorization.
export async function login(username, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error de autenticación");
  }
  const data = await res.json();
  localStorage.setItem("admin_token", data.token);
  localStorage.setItem("admin_user", data.username);
  localStorage.setItem("admin_is_super", data.isSuperAdmin ? "1" : "0");
  localStorage.setItem("admin_permissions", JSON.stringify(data.permissions || {}));
  return data;
}

// Logout. JWT es stateless, asi que solo borramos el token local.
export function logout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  localStorage.removeItem("admin_is_super");
  localStorage.removeItem("admin_permissions");
}

// Helpers de sesion (no son llamadas HTTP).
export function isSuperAdmin() {
  return localStorage.getItem("admin_is_super") === "1";
}

function getPermissions() {
  try {
    return JSON.parse(localStorage.getItem("admin_permissions") || "{}");
  } catch {
    return {};
  }
}

export function hasPermission(permKey) {
  if (isSuperAdmin()) return true;
  return Boolean(getPermissions()[permKey]);
}

// verifyToken no usa request() porque ante fallo devuelve false en lugar de
// lanzar excepcion (los componentes deciden si redirigir a login).
export async function verifyToken() {
  const res = await fetch(`${API_URL}/auth/verify`, { headers: getHeaders() });
  if (!res.ok) return false;
  try {
    const data = await res.json();
    if (data && typeof data === "object") {
      localStorage.setItem("admin_is_super", data.isSuperAdmin ? "1" : "0");
      localStorage.setItem("admin_permissions", JSON.stringify(data.permissions || {}));
    }
  } catch {
    // si la respuesta no es JSON valido igual consideramos el token valido
  }
  return true;
}

// --- Categorías ---
export const getCategories = () => get("/admin/categories");
export const createCategory = (c) => post("/admin/categories", c);
export const updateCategory = (id, d) => put("/admin/categories", id, d);
export const deleteCategory = (id) => del("/admin/categories", id);

// --- Items del Menú ---
export const getItems = () => get("/admin/items");
export const createItem = (i) => post("/admin/items", i);
export const updateItem = (id, d) => put("/admin/items", id, d);
export const deleteItem = (id) => del("/admin/items", id);

// --- Modelos AR ---
export const getModelos = () => get("/modelos");
export const createModeloAsset = (p) => post("/admin/modelos", p);
export const deleteModelo = (id) => del("/admin/modelos", id);

// --- Imagenes ---
export const getImagenes = () => get("/imagenes");
export const createImagenAsset = (p) => post("/admin/imagenes", p);
export const deleteImagen = (id) => del("/admin/imagenes", id);

// --- Historial de colores ---
export const getColorHistorial = () => get("/admin/historial-colores");

// --- Usuarios ---
export const getUsuarios = () => get("/admin/usuarios");
export const createUsuario = (p) => post("/admin/usuarios", p);
export const updateUsuario = (id, p) => put("/admin/usuarios", id, p);
export const deleteUsuario = (id) => del("/admin/usuarios", id);
