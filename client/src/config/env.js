// Normaliza la base de la API. La variable de entorno puede venir como:
//   - vacía           -> usamos "/api" relativo (mismo host, caso Vercel)
//   - ".../workers.dev"      (sin /api)
//   - ".../workers.dev/api"  (con /api)
// En todos los casos terminamos con UNA sola vez "/api", para que el frontend
// no dependa de si quien configuró la variable recordó agregar el sufijo.
const RAW = import.meta.env.VITE_API_URL;

function buildApiUrl(raw) {
  if (!raw || !raw.trim()) return "/api";
  // Quita barras finales y un "/api" final si ya viene incluido.
  const base = raw.trim().replace(/\/+$/, "").replace(/\/api$/, "");
  return `${base}/api`;
}

const ENV = {
  API_URL: buildApiUrl(RAW),
};

export { ENV };