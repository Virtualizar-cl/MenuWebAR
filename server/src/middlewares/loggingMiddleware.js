// Middleware de logging para registrar acciones POST/PUT/DELETE.
// Se ejecuta DESPUES del handler, por eso intercepta res.json().

const { addLog } = require("../services/logsStore");

function getEntityType(path) {
  // Ignorar rutas de logs, auth, health
  if (path.includes("/logs")) return null;
  if (path.includes("/auth/")) return null;
  if (path.includes("/health")) return null;
  if (path.includes("/menu")) return null;

  // Rutas de entidades
  if (path.includes("/admin/items")) return "item";
  if (path.includes("/admin/categories")) return "category";
  if (path.includes("/admin/imagenes") || path.includes("/upload-image")) return "image";
  if (path.includes("/admin/modelos")) return "modelo";
  if (path.includes("/admin/password")) return "password";

  return null;
}

function getAction(method) {
  if (method === "POST") return "CREATE";
  if (method === "PUT") return "UPDATE";
  if (method === "DELETE") return "DELETE";
  return "UNKNOWN";
}

function extractEntityId(path, params) {
  const match = path.match(/\/(items|categories|imagenes|modelos)\/([^/]+)/);
  if (match) {
    return match[2];
  }
  return params.id || params[0] || null;
}

function loggingMiddleware(req, res, next) {
  const start = Date.now();

  const originalJson = res.json.bind(res);

  res.json = function (body) {
    const statusCode = res.statusCode;
    const isSuccess = statusCode >= 200 && statusCode < 400;
    const isWriteMethod = ["POST", "PUT", "DELETE"].includes(req.method);

    if (isSuccess && isWriteMethod && req.user) {
      const entityType = getEntityType(req.path);

      // Ignorar si no es una ruta que nos interesa
      if (!entityType) {
        return originalJson(body);
      }

      const action = getAction(req.method);

      let entityId = extractEntityId(req.path, req.params);
      let entityLabel = null;

      if (body && typeof body === "object") {
        entityLabel = body.label || body.name || body.title || null;
        if (!entityId && body.id) {
          entityId = body.id;
        }
      }

      const logEntry = {
        username: req.user.username,
        action,
        entityType,
        entityId: entityId || null,
        entityLabel: entityLabel || null,
        details: {
          statusCode,
          response: body,
        },
        method: req.method,
        path: req.originalUrl || req.path,
        ip: req.ip || req.connection?.remoteAddress || "unknown",
        userAgent: req.get("user-agent") || "unknown",
        duration: Date.now() - start,
      };

      addLog(logEntry).catch((err) => console.error("Error saving log:", err.message));
    }

    return originalJson(body);
  };

  next();
}

module.exports = loggingMiddleware;
