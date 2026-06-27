import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import bcrypt from "bcryptjs";
import adapter, { PERMISSION_KEYS } from "./server/src/db/d1Adapter.js";
import * as storage from "./server/src/storage/r2Storage.js";

const {
  loadData,
  createModeloAsset,
  createImagenAsset,
  deleteImagenAsset,
  deleteModeloAsset,
  createCategory,
  updateCategory,
  deleteCategory,
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
} = adapter;

const { uploadFileToStorage, deleteStorageFile, isManagedStorageUrl } = storage;

const JWT_ALG = "HS256";
const SAFE_PATH_RE = /^\/assets\/(modelosAR|IMG)\//;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const CARD_MESSAGE_MAX = 40;

function isSafePath(p) {
  if (!p) return true;
  if (typeof p !== "string") return false;
  if (p.includes("..")) return false;
  if (!p.startsWith("/")) return false;
  return SAFE_PATH_RE.test(p);
}
function isSafeImageRef(value) {
  return isSafePath(value) || isManagedStorageUrl(value);
}
function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}
function isValidId(val) {
  return typeof val === "string" && /^[a-zA-Z0-9_-]+$/.test(val);
}
function isValidPrice(val) {
  return typeof val === "string" && val.trim().length > 0;
}
function isValidModeloId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id);
}
function validateCardFields({ cardColor, cardMessage }) {
  if (cardColor !== undefined && cardColor !== null && cardColor !== "") {
    if (typeof cardColor !== "string" || !HEX_COLOR_RE.test(cardColor))
      return "cardColor debe ser hex #RRGGBB";
  }
  if (cardMessage !== undefined && cardMessage !== null) {
    if (typeof cardMessage !== "string") return "cardMessage debe ser texto";
    if (cardMessage.length > CARD_MESSAGE_MAX)
      return `cardMessage maximo ${CARD_MESSAGE_MAX} caracteres`;
  }
  return null;
}
function resolveModelAR(modeloId, modelos) {
  if (!modeloId) return "";
  const modelo = (modelos || []).find((m) => m.id === modeloId);
  return modelo ? modelo.src : "";
}
function resolveMenuItems(items, modelos) {
  return items.map((item) => ({ ...item, modelAR: resolveModelAR(item.modelAR, modelos) }));
}
function allPermissionsTrue() {
  const all = {};
  for (const k of PERMISSION_KEYS) all[k] = true;
  return all;
}

function getEnv(c) {
  return {
    JWT_SECRET: c.env.JWT_SECRET || "dev-only-insecure-secret",
    ADMIN_EMAIL: c.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: c.env.ADMIN_PASSWORD_HASH,
  };
}

// La BD esta disponible si hay binding D1. Devuelve 503 si falta.
function dataSource(c) {
  if (c.env.DB) return null;
  return c.json({ error: "D1 no esta configurado. Asocia el binding DB en wrangler.toml." }, 503);
}
function routeError(c, error) {
  const statusCode = Number.isInteger(error?.status) ? error.status : 500;
  if (statusCode >= 500) console.error("D1 route error:", error?.message || error);
  return c.json({ error: error?.message || "Error de datos" }, statusCode);
}

const app = new Hono();
app.use("*", cors());

// --- AUTH middleware manual (reconstruye permisos) ---
async function auth(c, next) {
  const header = c.req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) return c.json({ error: "Token requerido" }, 401);
  const { JWT_SECRET } = getEnv(c);
  try {
    const decoded = await verify(header.split(" ")[1], JWT_SECRET, JWT_ALG);
    c.set("user", {
      ...decoded,
      permissions: decoded.isSuperAdmin ? allPermissionsTrue() : decoded.permissions || {},
    });
    await next();
  } catch {
    return c.json({ error: "Token invalido o expirado" }, 401);
  }
}
function requirePermission(permKey) {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "No autenticado" }, 401);
    if (user.permissions && user.permissions[permKey]) return next();
    return c.json({ error: "No tienes permiso para esta accion", missing: permKey }, 403);
  };
}

// --- Rate limiting in-memory (best-effort) ---
const rlStore = new Map();
function rateLimit(max, windowMs) {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();
    const rec = rlStore.get(key);
    if (!rec || now > rec.reset) {
      rlStore.set(key, { count: 1, reset: now + windowMs });
    } else {
      rec.count++;
      if (rec.count > max)
        return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo más tarde." }, 429);
    }
    await next();
  };
}

const apiLimiter = rateLimit(200, 15 * 60 * 1000);
const loginLimiter = rateLimit(15, 15 * 60 * 1000);
app.use("/api/*", apiLimiter);

// ========== HEALTH ==========
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ========== PÚBLICAS ==========
app.get("/api/menu", async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    const data = await loadData();
    return c.json({ ...data, menuItems: resolveMenuItems(data.menuItems, data.modelos) });
  } catch (e) {
    return routeError(c, e);
  }
});
app.get("/api/categories", async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json((await loadData()).categories);
  } catch (e) {
    return routeError(c, e);
  }
});
app.get("/api/modelos", async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json((await loadData()).modelos || []);
  } catch (e) {
    return routeError(c, e);
  }
});
app.get("/api/imagenes", async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json((await loadData()).imagenes || []);
  } catch (e) {
    return routeError(c, e);
  }
});
app.get("/api/menu-items", async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    const data = await loadData();
    return c.json(resolveMenuItems(data.menuItems, data.modelos));
  } catch (e) {
    return routeError(c, e);
  }
});

// ========== AUTH ==========
app.post("/api/auth/login", loginLimiter, async (c) => {
  const { JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH } = getEnv(c);
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: "Usuario y contraseña requeridos" }, 400);

  if (ADMIN_EMAIL && username === ADMIN_EMAIL) {
    if (!ADMIN_PASSWORD_HASH || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH))
      return c.json({ error: "Credenciales incorrectas" }, 401);
    const perms = allPermissionsTrue();
    const token = await sign(
      {
        username,
        isSuperAdmin: true,
        permissions: perms,
        exp: Math.floor(Date.now() / 1000) + 28800,
      },
      JWT_SECRET,
      JWT_ALG,
    );
    return c.json({ token, username, isSuperAdmin: true, permissions: perms });
  }

  if (!c.env.DB) return c.json({ error: "Credenciales incorrectas" }, 401);
  try {
    const user = await verifyUsuarioPassword(username, password);
    if (!user) return c.json({ error: "Credenciales incorrectas" }, 401);
    const token = await sign(
      {
        username: user.email,
        isSuperAdmin: false,
        permissions: user.permissions,
        userId: user.id,
        exp: Math.floor(Date.now() / 1000) + 28800,
      },
      JWT_SECRET,
      JWT_ALG,
    );
    return c.json({
      token,
      username: user.email,
      isSuperAdmin: false,
      permissions: user.permissions,
    });
  } catch (e) {
    return routeError(c, e);
  }
});

app.get("/api/auth/verify", auth, (c) => {
  const user = c.get("user");
  return c.json({
    valid: true,
    username: user.username,
    isSuperAdmin: Boolean(user.isSuperAdmin),
    permissions: user.permissions,
  });
});

// ========== ADMIN: uploads ==========
const ALLOWED_IMG = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE = 50 * 1024 * 1024;

async function readMultipart(c) {
  const body = await c.req.parseBody();
  const file = body.file;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  return { file, name };
}
function fileToMulterLike(file, buffer) {
  return {
    originalname: file.name,
    mimetype: file.type,
    buffer,
  };
}

app.post("/api/admin/imagenes", auth, requirePermission("puede_subir_archivos"), async (c) => {
  const { file, name } = await readMultipart(c);
  if (!file || typeof file === "string")
    return c.json({ error: "No se subió ningún archivo" }, 400);
  if (file.size > MAX_FILE) return c.json({ error: "El archivo es muy grande (máximo 50MB)" }, 400);
  if (!ALLOWED_IMG.includes(file.type))
    return c.json({ error: "Solo se permiten imágenes (JPEG, PNG, WebP, GIF)" }, 400);
  const finalName = name || file.name.replace(/\.[^/.]+$/, "").trim();
  if (!finalName) return c.json({ error: "El nombre de la imagen es requerido" }, 400);
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadFileToStorage(fileToMulterLike(file, buffer), "images");
    const saved = await createImagenAsset({ label: finalName, url });
    return c.json(saved, 201);
  } catch (e) {
    return routeError(c, e);
  }
});

app.post("/api/admin/modelos", auth, requirePermission("puede_subir_archivos"), async (c) => {
  const { file, name } = await readMultipart(c);
  if (!file || typeof file === "string")
    return c.json({ error: "No se subió ningún archivo" }, 400);
  if (file.size > MAX_FILE) return c.json({ error: "El archivo es muy grande (máximo 50MB)" }, 400);
  if (!file.name.toLowerCase().endsWith(".glb"))
    return c.json({ error: "El modelo AR debe tener extensión .glb" }, 400);
  const finalName = name || file.name.replace(/\.[^/.]+$/, "").trim();
  if (!finalName) return c.json({ error: "El nombre del modelo es requerido" }, 400);
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadFileToStorage(fileToMulterLike(file, buffer), "models");
    const saved = await createModeloAsset({ label: finalName, url });
    return c.json(saved, 201);
  } catch (e) {
    return routeError(c, e);
  }
});

app.delete(
  "/api/admin/imagenes/:id",
  auth,
  requirePermission("puede_eliminar_archivos"),
  async (c) => {
    const ds = dataSource(c);
    if (ds) return ds;
    try {
      const { url } = await deleteImagenAsset(c.req.param("id"));
      const storageResult = url ? await deleteStorageFile(url) : null;
      return c.json({ message: "Imagen eliminada", storage: storageResult });
    } catch (e) {
      return routeError(c, e);
    }
  },
);

app.delete(
  "/api/admin/modelos/:id",
  auth,
  requirePermission("puede_eliminar_archivos"),
  async (c) => {
    const ds = dataSource(c);
    if (ds) return ds;
    try {
      const { url } = await deleteModeloAsset(c.req.param("id"));
      const storageResult = url ? await deleteStorageFile(url) : null;
      return c.json({ message: "Modelo eliminado", storage: storageResult });
    } catch (e) {
      return routeError(c, e);
    }
  },
);

// ========== ADMIN: categories ==========
app.get("/api/admin/categories", auth, async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json((await loadData()).categories);
  } catch (e) {
    return routeError(c, e);
  }
});
app.post(
  "/api/admin/categories",
  auth,
  requirePermission("puede_gestionar_categorias"),
  async (c) => {
    const { id, label } = await c.req.json().catch(() => ({}));
    if (!isValidId(id))
      return c.json({ error: "id invalido (solo letras, numeros, guion y guion bajo)" }, 400);
    if (!isNonEmptyString(label)) return c.json({ error: "label es requerido" }, 400);
    const ds = dataSource(c);
    if (ds) return ds;
    try {
      return c.json(await createCategory({ id, label }), 201);
    } catch (e) {
      return routeError(c, e);
    }
  },
);
app.put(
  "/api/admin/categories/:id",
  auth,
  requirePermission("puede_gestionar_categorias"),
  async (c) => {
    const { label } = await c.req.json().catch(() => ({}));
    if (label !== undefined && !isNonEmptyString(label))
      return c.json({ error: "label no puede estar vacio" }, 400);
    const ds = dataSource(c);
    if (ds) return ds;
    try {
      return c.json(await updateCategory(c.req.param("id"), { label }));
    } catch (e) {
      return routeError(c, e);
    }
  },
);
app.delete(
  "/api/admin/categories/:id",
  auth,
  requirePermission("puede_gestionar_categorias"),
  async (c) => {
    const ds = dataSource(c);
    if (ds) return ds;
    try {
      await deleteCategory(c.req.param("id"));
      return c.json({ message: "Categoria y sus items eliminados" });
    } catch (e) {
      return routeError(c, e);
    }
  },
);

// ========== ADMIN: items ==========
app.get("/api/admin/items", auth, async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json((await loadData()).menuItems);
  } catch (e) {
    return routeError(c, e);
  }
});
app.post("/api/admin/items", auth, requirePermission("puede_crear_platos"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!isValidId(b.id))
    return c.json({ error: "id invalido (solo letras, numeros, guion y guion bajo)" }, 400);
  if (!isNonEmptyString(b.category)) return c.json({ error: "category es requerido" }, 400);
  if (!isNonEmptyString(b.name)) return c.json({ error: "name es requerido" }, 400);
  if (!isValidPrice(b.price)) return c.json({ error: "price es requerido" }, 400);
  if (b.image && !isSafeImageRef(b.image)) return c.json({ error: "Imagen no permitida" }, 400);
  if (b.modelAR && !isValidModeloId(b.modelAR))
    return c.json({ error: "modelAR debe ser un id de modelo valido" }, 400);
  const cardErr = validateCardFields(b);
  if (cardErr) return c.json({ error: cardErr }, 400);
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json(await createItem(b), 201);
  } catch (e) {
    return routeError(c, e);
  }
});
app.put("/api/admin/items/:id", auth, requirePermission("puede_editar_platos"), async (c) => {
  const b = (await c.req.json().catch(() => ({}))) || {};
  if (b.image !== undefined && b.image && !isSafeImageRef(b.image))
    return c.json({ error: "Imagen no permitida" }, 400);
  if (b.modelAR !== undefined && b.modelAR && !isValidModeloId(b.modelAR))
    return c.json({ error: "modelAR debe ser un id de modelo valido" }, 400);
  const cardErr = validateCardFields(b);
  if (cardErr) return c.json({ error: cardErr }, 400);
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json(await updateItem(c.req.param("id"), b));
  } catch (e) {
    return routeError(c, e);
  }
});
app.delete("/api/admin/items/:id", auth, requirePermission("puede_eliminar_platos"), async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    await deleteItem(c.req.param("id"));
    return c.json({ message: "Item eliminado" });
  } catch (e) {
    return routeError(c, e);
  }
});

// ========== ADMIN: historial colores ==========
app.get("/api/admin/historial-colores", auth, async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json(await listColorHistorial());
  } catch (e) {
    return routeError(c, e);
  }
});
app.post("/api/admin/historial-colores", auth, async (c) => {
  const { color } = await c.req.json().catch(() => ({}));
  if (typeof color !== "string" || !HEX_COLOR_RE.test(color))
    return c.json({ error: "color debe ser hex #RRGGBB" }, 400);
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json(await pushColorToHistorial(color), 201);
  } catch (e) {
    return routeError(c, e);
  }
});

// ========== ADMIN: usuarios ==========
app.get("/api/admin/usuarios", auth, requirePermission("puede_gestionar_usuarios"), async (c) => {
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json(await listUsuarios());
  } catch (e) {
    return routeError(c, e);
  }
});
app.post("/api/admin/usuarios", auth, requirePermission("puede_gestionar_usuarios"), async (c) => {
  const { email, password, permissions } = await c.req.json().catch(() => ({}));
  if (!isNonEmptyString(email)) return c.json({ error: "email es requerido" }, 400);
  if (typeof password !== "string" || password.length < 6)
    return c.json({ error: "password es requerido y debe tener al menos 6 caracteres" }, 400);
  const ds = dataSource(c);
  if (ds) return ds;
  try {
    return c.json(await createUsuario({ email, password, permissions }), 201);
  } catch (e) {
    return routeError(c, e);
  }
});
app.put(
  "/api/admin/usuarios/:id",
  auth,
  requirePermission("puede_gestionar_usuarios"),
  async (c) => {
    const ds = dataSource(c);
    if (ds) return ds;
    try {
      return c.json(
        await updateUsuario(c.req.param("id"), (await c.req.json().catch(() => ({}))) || {}),
      );
    } catch (e) {
      return routeError(c, e);
    }
  },
);
app.delete(
  "/api/admin/usuarios/:id",
  auth,
  requirePermission("puede_gestionar_usuarios"),
  async (c) => {
    const ds = dataSource(c);
    if (ds) return ds;
    const user = c.get("user");
    const targetId = parseInt(c.req.param("id"), 10);
    if (user.userId && user.userId === targetId)
      return c.json({ error: "No puedes eliminar tu propio usuario" }, 400);
    try {
      await deleteUsuario(c.req.param("id"));
      return c.json({ message: "Usuario eliminado" });
    } catch (e) {
      return routeError(c, e);
    }
  },
);

// ========== ADMIN: password (super_admin via env) ==========
app.put("/api/admin/password", auth, loginLimiter, async (c) => {
  const { ADMIN_PASSWORD_HASH } = getEnv(c);
  const { currentPassword, newPassword } = await c.req.json().catch(() => ({}));
  if (!currentPassword || !newPassword)
    return c.json({ error: "Contraseña actual y nueva requeridas" }, 400);
  if (newPassword.length < 6)
    return c.json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);
  const user = c.get("user");
  if (!user.isSuperAdmin)
    return c.json({ error: "Solo el super admin puede cambiar su pass por este endpoint" }, 403);
  if (!ADMIN_PASSWORD_HASH || !bcrypt.compareSync(currentPassword, ADMIN_PASSWORD_HASH))
    return c.json({ error: "Contraseña actual incorrecta" }, 401);
  const newHash = bcrypt.hashSync(newPassword, 10);
  return c.json(
    {
      error:
        "Cambio de pass del super admin se hace por env var. Actualiza ADMIN_PASSWORD_HASH en Cloudflare con el hash de abajo y redeploy.",
      newHash,
    },
    501,
  );
});

app.onError((err, c) => {
  console.error("Unhandled error:", err.message);
  return c.json({ error: "Error interno del servidor", code: "INTERNAL_ERROR" }, 500);
});

export default {
  fetch(request, env, ctx) {
    // process.env para libs que lo leen (JWT_SECRET, ADMIN_*).
    globalThis.process ??= {};
    globalThis.process.env = { ...globalThis.process.env, ...env };
    // Bindings D1 / R2 para los adaptadores (lazy, por request).
    globalThis.__D1 = env.DB || null;
    globalThis.__R2 = env.ASSETS || null;
    globalThis.__R2_BASE = env.R2_PUBLIC_URL || "";
    return app.fetch(request, env, ctx);
  },
};
