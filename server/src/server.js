// Carga las variables de entorno desde .env que esta en la raiz del proyecto,
// no en la carpeta /server. Por eso el path con "..".
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

// Toda la capa de datos vive en supabaseStore. Este archivo solo se encarga
// de exponer los endpoints HTTP y validar lo que entra.
const {
  isSupabaseEnabled,
  loadSupabaseData,
  createModeloAsset: createSupabaseModeloAsset,
  createImagenAsset: createSupabaseImagenAsset,
  deleteImagenAsset: deleteSupabaseImagenAsset,
  deleteModeloAsset: deleteSupabaseModeloAsset,
  createCategory: createSupabaseCategory,
  updateCategory: updateSupabaseCategory,
  deleteCategory: deleteSupabaseCategory,
  createItem: createSupabaseItem,
  updateItem: updateSupabaseItem,
  deleteItem: deleteSupabaseItem,
  // historial de colores: nuevas funciones del store
  listColorHistorial,
  pushColorToHistorial,
  // usuarios: cuentas secundarias con permisos granulares
  PERMISSION_KEYS,
  listUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  verifyUsuarioPassword,
  // storage
  uploadFileToStorage,
  deleteStorageFile,
  isSupabaseStorageUrl,
} = require("./supabaseStore");

const loggingMiddleware = require("./middlewares/loggingMiddleware");
const activityLogsRouter = require("./routes/activityLogs");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_FILE = path.join(__dirname, "data", "admin.json");

// En produccion no dejamos arrancar sin JWT_SECRET. En dev tiramos un warning
// y usamos un valor por defecto para que el equipo pueda trabajar sin trabas.
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET environment variable is required in production.");
    process.exit(1);
  }
  console.warn("WARNING: JWT_SECRET not set. Using insecure default for development only.");
}

const jwtSecret = JWT_SECRET || "dev-only-insecure-secret";

// --- Multer ---
// Almacena en memoria para poder subir el buffer a Supabase Storage.
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — suficiente para .glb
});

// --- Validación ---
// Estos regex y helpers son la primera linea de defensa. Validamos en el server
// aunque el frontend ya valide, porque nunca confiamos en el cliente.

// Solo aceptamos paths locales que empiecen con /assets/modelosAR/ o /assets/IMG/.
// Cualquier otro path se rechaza para evitar que alguien nos haga servir
// archivos fuera de esas carpetas.
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

// Acepta URLs de Supabase Storage además de paths locales.
// Las URLs de Cloudinary existentes en la BD siguen funcionando (no se validan
// al editar porque el valor ya está almacenado, solo se validan al crear).
function isSafeImageRef(value) {
  return isSafePath(value) || isSupabaseStorageUrl(value);
}

function isSafeModelSrc(value) {
  return isSafePath(value) || isSupabaseStorageUrl(value);
}

function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}

// Los ids que llegan del frontend son strings tipo "item-12" o "cat-bebidas".
// Esto valida que solo tengan letras, numeros, guion y guion bajo.
function isValidId(val) {
  return typeof val === "string" && /^[a-zA-Z0-9_-]+$/.test(val);
}

function isValidPrice(val) {
  return typeof val === "string" && val.trim().length > 0;
}

function isValidModeloId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id);
}

// Valida los campos cardColor (color hex de la card) y cardMessage (badge)
// que son opcionales pero si vienen tienen que tener el formato correcto.
function validateCardFields({ cardColor, cardMessage }) {
  if (cardColor !== undefined && cardColor !== null && cardColor !== "") {
    if (typeof cardColor !== "string" || !HEX_COLOR_RE.test(cardColor)) {
      return "cardColor debe ser hex #RRGGBB";
    }
  }
  if (cardMessage !== undefined && cardMessage !== null) {
    if (typeof cardMessage !== "string") {
      return "cardMessage debe ser texto";
    }
    if (cardMessage.length > CARD_MESSAGE_MAX) {
      return `cardMessage maximo ${CARD_MESSAGE_MAX} caracteres`;
    }
  }
  return null;
}

// El frontend solo trabaja con ids de modelos (mod-1, mod-2). Cuando servimos
// el menu publico tenemos que convertir ese id al URL real del .glb para que
// <model-viewer> lo pueda cargar.
function resolveModelAR(modeloId, modelos) {
  if (!modeloId) return "";
  const modelo = (modelos || []).find((m) => m.id === modeloId);
  return modelo ? modelo.src : "";
}

function resolveMenuItems(items, modelos) {
  return items.map((item) => ({
    ...item,
    modelAR: resolveModelAR(item.modelAR, modelos),
  }));
}

// Crea el usuario admin la primera vez que corre el servidor. Si ya existe,
// no hace nada. La pass por defecto viene del .env y se hashea con bcrypt.
function initAdmin() {
  let needsInit = false;

  if (!fs.existsSync(ADMIN_FILE)) {
    needsInit = true;
  } else {
    try {
      const existing = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf-8"));
      if (!existing.username || !existing.password) {
        needsInit = true;
      }
    } catch {
      // Si el JSON esta corrupto, lo regeneramos
      needsInit = true;
    }
  }

  if (needsInit) {
    const defaultEmail = process.env.ADMIN_DEFAULT_EMAIL || "admin@hublab.com";
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;

    if (!defaultPassword) {
      console.error(
        "ADMIN_DEFAULT_PASSWORD env var is required to create the initial admin account.",
      );
      console.error("Set it in your .env file. See .env.example for reference.");
      process.exit(1);
    }

    const hash = bcrypt.hashSync(defaultPassword, 10);
    fs.writeFileSync(
      ADMIN_FILE,
      JSON.stringify({ username: defaultEmail, password: hash }, null, 2),
    );
    console.log(`Admin created: ${defaultEmail} (change password after first login)`);
  }
}

// Cuando algo falla en supabaseStore, tira un error con .status (ej 404, 400).
// Esta funcion lo traduce al response HTTP, y loguea solo los errores 500+
// para no llenar los logs de errores de validacion.
function handleSupabaseRouteError(res, error) {
  const statusCode = Number.isInteger(error?.status) ? error.status : 500;

  if (statusCode >= 500) {
    console.error("Supabase route error:", error?.message || error);
  }

  return res.status(statusCode).json({ error: error?.message || "Error de datos en Supabase" });
}

// Si alguien llama a una ruta de datos sin tener Supabase configurado, le
// decimos 503 en lugar de fallar con error raro.
function requireSupabaseDataSource(res) {
  if (isSupabaseEnabled) return true;

  return res.status(503).json({
    error:
      "Supabase no esta configurado. Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para usar la API de datos.",
  });
}

// Devuelve un objeto de permisos donde TODO esta en true. Lo uso para el
// super_admin que esta en admin.json: bypasea cualquier check granular.
function allPermissionsTrue() {
  const all = {};
  for (const k of PERMISSION_KEYS) all[k] = true;
  return all;
}

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Limite agresivo para login: 15 intentos cada 15 min por IP.
// Esto frena ataques de fuerza bruta a la contraseña del admin.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de login. Intenta de nuevo en 15 minutos." },
});

// Limite general para el resto de la API.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo más tarde." },
});

app.use("/api/", apiLimiter);

// Middleware de logging para estadísticas
app.use(loggingMiddleware);

// Middleware que valida el token JWT. Se usa en todas las rutas /api/admin/*.
// Si el token es valido, guarda los datos decodificados en req.user. Ademas
// reconstruye los permisos: si el token dice isSuperAdmin -> all true, si no
// usa los permisos que vinieron en el token.
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token requerido" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, jwtSecret);
    req.user = {
      ...decoded,
      // si es super_admin (admin.json) aplicamos all true, si no respetamos
      // lo que vino en el token (que se firmo en el login con los permisos
      // de la BD)
      permissions: decoded.isSuperAdmin ? allPermissionsTrue() : decoded.permissions || {},
    };
    next();
  } catch {
    return res.status(401).json({ error: "Token invalido o expirado" });
  }
}

// Middleware factory: devuelve un middleware que chequea que el usuario tenga
// el permiso indicado. Uso: app.delete(..., authMiddleware, requirePermission("puede_eliminar_platos"), handler).
// Si no tiene el permiso devuelve 403 con un mensaje claro para que el frontend
// pueda mostrar feedback util.
function requirePermission(permKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "No autenticado" });
    if (req.user.permissions && req.user.permissions[permKey]) return next();
    return res.status(403).json({
      error: "No tienes permiso para esta accion",
      missing: permKey,
    });
  };
}

// Handler de errores global. En dev muestra el stack, en prod solo el mensaje.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (process.env.NODE_ENV !== "production") {
    console.error("Unhandled error:", err.stack || err.message);
  } else {
    console.error("Unhandled error:", err.message);
  }
  res.status(500).json({ error: "Error interno del servidor", code: "INTERNAL_ERROR" });
}

// ========================
// HEALTH
// ========================
// Ruta basica para chequear que el server esta vivo (util para uptime monitors).
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ========================
// RUTAS PÚBLICAS
// ========================
// Estas rutas NO requieren auth. Las consume el menu publico que ven los
// clientes del restaurante.

// Endpoint principal: devuelve TODO lo que necesita el menu de una sola vez
// (categorias, platos, imagenes, modelos). El frontend hace fetch a esto
// cuando carga la pagina.
app.get("/api/menu", async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json({
      ...data,
      // Los platos guardan el id del modelo, pero el frontend necesita la URL
      // final para cargar el .glb. Resolvemos aca.
      menuItems: resolveMenuItems(data.menuItems, data.modelos),
    });
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.get("/api/categories", async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json(data.categories);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.get("/api/modelos", async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json(data.modelos || []);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.get("/api/imagenes", async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json(data.imagenes || []);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.get("/api/menu-items", async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json(resolveMenuItems(data.menuItems, data.modelos));
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

// ========================
// AUTENTICACIÓN
// ========================

// Login: ahora hay DOS fuentes de cuentas.
// 1) admin.json -> super_admin (bypasea todo). Si el username matchea, no
//    pasamos a la BD; las credenciales tienen que ser exactas.
// 2) tabla usuarios en Supabase -> usuarios con permisos granulares.
// El JWT incluye username, isSuperAdmin y permissions, asi el frontend sabe
// que puede mostrar y los middlewares server-side saben que dejar pasar.
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  }

  // Primera puerta: super_admin desde admin.json
  const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf-8"));
  if (username === admin.username) {
    if (!bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }
    const token = jwt.sign(
      { username, isSuperAdmin: true, permissions: allPermissionsTrue() },
      jwtSecret,
      { expiresIn: "8h" },
    );
    return res.json({
      token,
      username,
      isSuperAdmin: true,
      permissions: allPermissionsTrue(),
    });
  }

  // Segunda puerta: usuarios de la BD. Solo si Supabase esta habilitado
  if (!isSupabaseEnabled) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  try {
    const user = await verifyUsuarioPassword(username, password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }
    const token = jwt.sign(
      { username: user.email, isSuperAdmin: false, permissions: user.permissions, userId: user.id },
      jwtSecret,
      { expiresIn: "8h" },
    );
    return res.json({
      token,
      username: user.email,
      isSuperAdmin: false,
      permissions: user.permissions,
    });
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

// Verifica si el token sigue siendo valido. El frontend lo llama al cargar
// para saber si puede mostrar el admin sin pedir login de nuevo. Devolvemos
// tambien isSuperAdmin y permissions para que el frontend renderice los
// botones segun corresponda sin tener que decodificar el JWT manualmente.
app.get("/api/auth/verify", authMiddleware, (req, res) => {
  res.json({
    valid: true,
    username: req.user.username,
    isSuperAdmin: Boolean(req.user.isSuperAdmin),
    permissions: req.user.permissions,
  });
});

// ========================
// ADMIN
// ========================
// Todas estas rutas requieren JWT valido (authMiddleware) y un permiso
// especifico segun la accion.

// Sube un archivo de imagen a Supabase Storage y lo registra en la BD.
// Recibe multipart: "file" (imagen), "name" (nombre descriptivo).
app.post(
  "/api/admin/imagenes",
  authMiddleware,
  requirePermission("puede_subir_archivos"),
  (req, res) => {
    uploadMemory.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "El archivo es muy grande (máximo 50MB)" });
          }
          return res.status(400).json({ error: "Error al subir el archivo" });
        }
        return res.status(400).json({ error: err.message || "Error al subir el archivo" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No se subió ningún archivo" });
      }

      const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Solo se permiten imágenes (JPEG, PNG, WebP, GIF)" });
      }

      const name = req.body.name
        ? req.body.name.trim()
        : req.file.originalname.replace(/\.[^/.]+$/, "").trim();

      if (!name) {
        return res.status(400).json({ error: "El nombre de la imagen es requerido" });
      }

      if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

      try {
        const url = await uploadFileToStorage(req.file, "images");
        const saved = await createSupabaseImagenAsset({ label: name, url });
        return res.status(201).json(saved);
      } catch (error) {
        return handleSupabaseRouteError(res, error);
      }
    });
  },
);

// Sube un modelo AR (.glb) a Supabase Storage y lo registra en la BD.
// Recibe multipart: "file" (.glb), "name" (nombre descriptivo).
app.post(
  "/api/admin/modelos",
  authMiddleware,
  requirePermission("puede_subir_archivos"),
  (req, res) => {
    uploadMemory.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "El archivo es muy grande (máximo 50MB)" });
          }
          return res.status(400).json({ error: "Error al subir el archivo" });
        }
        return res.status(400).json({ error: err.message || "Error al subir el archivo" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No se subió ningún archivo" });
      }

      if (!req.file.originalname.toLowerCase().endsWith(".glb")) {
        return res.status(400).json({ error: "El modelo AR debe tener extensión .glb" });
      }

      const name = req.body.name
        ? req.body.name.trim()
        : req.file.originalname.replace(/\.[^/.]+$/, "").trim();

      if (!name) {
        return res.status(400).json({ error: "El nombre del modelo es requerido" });
      }

      if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

      try {
        const url = await uploadFileToStorage(req.file, "models");
        const saved = await createSupabaseModeloAsset({ label: name, url });
        return res.status(201).json(saved);
      } catch (error) {
        return handleSupabaseRouteError(res, error);
      }
    });
  },
);

// Borrado de imagen: elimina de la BD y si la URL es de Supabase Storage
// tambien borra el archivo para no dejar basura.
app.delete(
  "/api/admin/imagenes/:id",
  authMiddleware,
  requirePermission("puede_eliminar_archivos"),
  async (req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    try {
      const { url } = await deleteSupabaseImagenAsset(req.params.id);
      const storageResult = url ? await deleteStorageFile(url) : null;

      return res.json({ message: "Imagen eliminada", storage: storageResult });
    } catch (error) {
      return handleSupabaseRouteError(res, error);
    }
  },
);

// Borrado de modelo: elimina de la BD y del storage si corresponde.
app.delete(
  "/api/admin/modelos/:id",
  authMiddleware,
  requirePermission("puede_eliminar_archivos"),
  async (req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    try {
      const { url } = await deleteSupabaseModeloAsset(req.params.id);
      const storageResult = url ? await deleteStorageFile(url) : null;

      return res.json({ message: "Modelo eliminado", storage: storageResult });
    } catch (error) {
      return handleSupabaseRouteError(res, error);
    }
  },
);

// Categorías
// El GET no necesita permiso especifico (cualquier usuario logueado lo necesita
// para ver el dashboard). El crear/editar/eliminar si requieren el permiso de
// gestionar categorias.
app.get("/api/admin/categories", authMiddleware, async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json(data.categories);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.post(
  "/api/admin/categories",
  authMiddleware,
  requirePermission("puede_gestionar_categorias"),
  (req, res) => {
    const { id, label } = req.body;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ error: "id invalido (solo letras, numeros, guion y guion bajo)" });
    }
    if (!isNonEmptyString(label)) {
      return res.status(400).json({ error: "label es requerido" });
    }

    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    createSupabaseCategory({ id, label })
      .then((newCategory) => res.status(201).json(newCategory))
      .catch((error) => handleSupabaseRouteError(res, error));
  },
);

app.put(
  "/api/admin/categories/:id",
  authMiddleware,
  requirePermission("puede_gestionar_categorias"),
  (req, res) => {
    const { label } = req.body;
    if (label !== undefined && !isNonEmptyString(label)) {
      return res.status(400).json({ error: "label no puede estar vacio" });
    }

    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    updateSupabaseCategory(req.params.id, { label })
      .then((updatedCategory) => res.json(updatedCategory))
      .catch((error) => handleSupabaseRouteError(res, error));
  },
);

// Borrar una categoria tambien borra todos sus platos en cascada (lo hace la
// FK de la BD con ON DELETE CASCADE).
app.delete(
  "/api/admin/categories/:id",
  authMiddleware,
  requirePermission("puede_gestionar_categorias"),
  (req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    deleteSupabaseCategory(req.params.id)
      .then(() => res.json({ message: "Categoria y sus items eliminados" }))
      .catch((error) => handleSupabaseRouteError(res, error));
  },
);

// Menu Items (platos). GET sin permiso especifico, los demas sí.
app.get("/api/admin/items", authMiddleware, async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const data = await loadSupabaseData();
    return res.json(data.menuItems);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.post(
  "/api/admin/items",
  authMiddleware,
  requirePermission("puede_crear_platos"),
  (req, res) => {
    const {
      id,
      category,
      name,
      description,
      price,
      image,
      modelAR,
      ingredients,
      cardColor,
      cardMessage,
    } = req.body;

    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ error: "id invalido (solo letras, numeros, guion y guion bajo)" });
    }
    if (!isNonEmptyString(category)) {
      return res.status(400).json({ error: "category es requerido" });
    }
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: "name es requerido" });
    }
    if (!isValidPrice(price)) {
      return res.status(400).json({ error: "price es requerido" });
    }
    if (image && !isSafeImageRef(image)) {
      return res.status(400).json({ error: "Imagen no permitida" });
    }
    if (modelAR && !isValidModeloId(modelAR)) {
      return res.status(400).json({ error: "modelAR debe ser un id de modelo valido" });
    }

    const cardErr = validateCardFields({ cardColor, cardMessage });
    if (cardErr) return res.status(400).json({ error: cardErr });

    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    createSupabaseItem({
      id,
      category,
      name,
      description,
      price,
      image,
      modelAR,
      ingredients,
      cardColor,
      cardMessage,
    })
      .then((newItem) => res.status(201).json(newItem))
      .catch((error) => handleSupabaseRouteError(res, error));
  },
);

app.put(
  "/api/admin/items/:id",
  authMiddleware,
  requirePermission("puede_editar_platos"),
  (req, res) => {
    const { image, modelAR, cardColor, cardMessage } = req.body || {};

    // En update solo validamos los campos que vengan en el body. Cualquier campo
    // omitido queda como estaba en la BD.
    if (image !== undefined && image && !isSafeImageRef(image)) {
      return res.status(400).json({ error: "Imagen no permitida" });
    }
    if (modelAR !== undefined && modelAR && !isValidModeloId(modelAR)) {
      return res.status(400).json({ error: "modelAR debe ser un id de modelo valido" });
    }

    const cardErr = validateCardFields({ cardColor, cardMessage });
    if (cardErr) return res.status(400).json({ error: cardErr });

    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    updateSupabaseItem(req.params.id, req.body || {})
      .then((updatedItem) => res.json(updatedItem))
      .catch((error) => handleSupabaseRouteError(res, error));
  },
);

app.delete(
  "/api/admin/items/:id",
  authMiddleware,
  requirePermission("puede_eliminar_platos"),
  (req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    deleteSupabaseItem(req.params.id)
      .then(() => res.json({ message: "Item eliminado" }))
      .catch((error) => handleSupabaseRouteError(res, error));
  },
);

// ========================
// HISTORIAL DE COLORES
// ========================
// Endpoints para listar y agregar colores al historial. El GET es admin (asi
// no exponemos preferencias de la marca a cualquiera) y el POST tambien.
// El push automatico al guardar plato lo hace supabaseStore.createItem /
// updateItem; este POST queda por si se quiere registrar un color sin guardar
// plato (ej: solo cambio de paleta).

app.get("/api/admin/historial-colores", authMiddleware, async (_req, res) => {
  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
  try {
    const colors = await listColorHistorial();
    return res.json(colors);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

app.post("/api/admin/historial-colores", authMiddleware, async (req, res) => {
  const { color } = req.body || {};

  // Validamos hex aca tambien para devolver 400 sin necesidad de pegarle a
  // Supabase con basura.
  if (typeof color !== "string" || !HEX_COLOR_RE.test(color)) {
    return res.status(400).json({ error: "color debe ser hex #RRGGBB" });
  }

  if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

  try {
    const result = await pushColorToHistorial(color);
    return res.status(201).json(result);
  } catch (error) {
    return handleSupabaseRouteError(res, error);
  }
});

// ========================
// USUARIOS
// ========================
// Toda la gestion de usuarios secundarios la protege el permiso
// "puede_gestionar_usuarios". El super_admin lo tiene siempre por ser
// super_admin (allPermissionsTrue), asi que el flujo natural es: super_admin
// crea usuarios y opcionalmente le da a uno o mas el permiso para que ellos
// tambien puedan gestionar.

app.get(
  "/api/admin/usuarios",
  authMiddleware,
  requirePermission("puede_gestionar_usuarios"),
  async (_req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);
    try {
      const users = await listUsuarios();
      return res.json(users);
    } catch (error) {
      return handleSupabaseRouteError(res, error);
    }
  },
);

app.post(
  "/api/admin/usuarios",
  authMiddleware,
  requirePermission("puede_gestionar_usuarios"),
  async (req, res) => {
    const { email, password, permissions } = req.body || {};

    if (!isNonEmptyString(email)) {
      return res.status(400).json({ error: "email es requerido" });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res
        .status(400)
        .json({ error: "password es requerido y debe tener al menos 6 caracteres" });
    }

    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    try {
      const newUser = await createUsuario({ email, password, permissions });
      return res.status(201).json(newUser);
    } catch (error) {
      return handleSupabaseRouteError(res, error);
    }
  },
);

app.put(
  "/api/admin/usuarios/:id",
  authMiddleware,
  requirePermission("puede_gestionar_usuarios"),
  async (req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    try {
      const updated = await updateUsuario(req.params.id, req.body || {});
      return res.json(updated);
    } catch (error) {
      return handleSupabaseRouteError(res, error);
    }
  },
);

app.delete(
  "/api/admin/usuarios/:id",
  authMiddleware,
  requirePermission("puede_gestionar_usuarios"),
  async (req, res) => {
    if (!isSupabaseEnabled) return requireSupabaseDataSource(res);

    // Pequeño candado: si por alguna razon el usuario logueado tiene userId
    // (lo seteamos en el JWT al hacer login desde la BD) y matchea con el id
    // que esta intentando borrar, no lo dejamos. Asi nadie se borra a si mismo
    // por accidente y se queda bloqueado afuera.
    const targetId = parseInt(req.params.id, 10);
    if (req.user.userId && req.user.userId === targetId) {
      return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
    }

    try {
      await deleteUsuario(req.params.id);
      return res.json({ message: "Usuario eliminado" });
    } catch (error) {
      return handleSupabaseRouteError(res, error);
    }
  },
);

// Cambio de contraseña. Pide la actual para confirmar, valida minimo 6
// caracteres y reescribe admin.json con el nuevo hash.
// OJO: este endpoint solo aplica al super_admin (admin.json). Los usuarios de
// la BD cambian su pass via /api/admin/usuarios/:id (lo hace el super_admin).
app.put("/api/admin/password", authMiddleware, loginLimiter, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Contraseña actual y nueva requeridas" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
  }

  // Solo super_admin puede usar este endpoint. Para los demas, el cambio lo
  // hace el super via la gestion de usuarios.
  if (!req.user.isSuperAdmin) {
    return res
      .status(403)
      .json({ error: "Solo el super admin puede cambiar su pass por este endpoint" });
  }

  const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf-8"));
  if (!bcrypt.compareSync(currentPassword, admin.password)) {
    return res.status(401).json({ error: "Contraseña actual incorrecta" });
  }

  admin.password = bcrypt.hashSync(newPassword, 10);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
  res.json({ message: "Contraseña actualizada" });
});

// Rutas de logs y estadísticas
app.use("/api/admin/logs", authMiddleware, activityLogsRouter);

app.use(errorHandler);

initAdmin();

module.exports = app;

// Cuando se ejecuta directo con `node server.js` arranca el server.
// Cuando se importa desde los tests, no arranca (se exporta app nomas).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
