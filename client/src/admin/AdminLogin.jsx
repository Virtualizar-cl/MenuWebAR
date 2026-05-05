// =============================================================================
// AdminLogin.jsx
// =============================================================================
// Pantalla de login del admin. Se muestra cuando AdminDashboard detecta que
// no hay token valido. Si el login es exitoso, llama onLogin() y el padre
// monta el dashboard.
//
// El backend tiene rate limiting agresivo aca: solo permite 15 intentos cada
// 15 min por IP, asi que cuidado al testear.
//
// MEJORAS UX (02-05-2026):
//   - autoFocus en el input de usuario para que pueda empezar a escribir
//     apenas carga la pagina (un click menos).
//   - Placeholders en los inputs para que sea mas obvio que escribir.
//   - Emoji en el boton de ingresar para que se vea mas amigable.
//   - Aviso visible del rate limit abajo asi no se asusta si lo bloquean.
//   - Inputs deshabilitados mientras carga para que no edite datos durante
//     la peticion en vuelo.
// =============================================================================

import { useState } from "react";
import { login } from "./api";
import styles from "./admin.module.css";

export default function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // loading deshabilita el boton mientras la peticion esta en vuelo, asi
  // evitamos doble click que dispararia dos requests.
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // login() guarda el token en localStorage si todo sale bien (esa
      // logica vive en api.js).
      await login(username, password);
      onLogin();
    } catch (err) {
      // Los errores tipicos son: credenciales malas o rate limit alcanzado.
      // El mensaje viene del backend, lo mostramos tal cual.
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <form className={styles.loginForm} onSubmit={handleSubmit}>
        <div className={styles.loginLogo}>🔐</div>
        <h1 className={styles.loginTitle}>Admin Route 66</h1>
        <p className={styles.loginSubtitle}>Gestión del Menú y Archivos</p>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <label className={styles.label}>
          Usuario
          {/* autoComplete="username" ayuda a los password managers a guardar
              correctamente las credenciales.
              autoFocus (NUEVO) posiciona el cursor aca apenas carga la
              pagina, asi puede tipear directo sin tener que clickear */}
          <input
            type="text"
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="admin"
            required
            disabled={loading}
            autoFocus
          />
        </label>

        <label className={styles.label}>
          Contraseña
          <input
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            required
            disabled={loading}
          />
        </label>

        <button className={styles.btnPrimary} type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "🔓 Ingresar"}
        </button>

        {/* Aviso del rate limit. Es importante mostrarlo porque si alguien
            se equivoca varias veces queda bloqueado y no entiende por que.
            Mejor que lo sepa de antes. */}
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.3)",
            textAlign: "center",
          }}
        >
          ℹ️ Máximo 15 intentos por 15 minutos
        </p>
      </form>
    </div>
  );
}
