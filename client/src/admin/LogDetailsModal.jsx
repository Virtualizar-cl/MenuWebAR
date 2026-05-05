import { ACTION_STYLES, ENTITY_ICONS } from "../utils/constants";
import { formatDate } from "../utils/dateUtils";
import styles from "./LogsPanel.module.css";

// Subcomponentes para evitar duplicar la estructura de fila/seccion.
function DetailsRow({ label, children }) {
  return (
    <div className={styles.logDetailsRow}>
      <span className={styles.logDetailsLabel}>{label}</span>
      <span className={styles.logDetailsValue}>{children}</span>
    </div>
  );
}

function DetailsSection({ title, children }) {
  return (
    <div className={styles.logDetailsSection}>
      <h4>{title}</h4>
      <div className={styles.logDetailsGrid}>{children}</div>
    </div>
  );
}

export function LogDetailsContent({ log }) {
  if (!log) return null;

  const details = log.details
    ? typeof log.details === "string"
      ? JSON.parse(log.details)
      : log.details
    : {};

  const actionStyle = ACTION_STYLES[log.action];

  return (
    <div className={styles.logDetailsContent}>
      <DetailsSection title="Información General">
        <DetailsRow label="ID">{log.id}</DetailsRow>
        <DetailsRow label="Fecha">{formatDate(log.created_at)}</DetailsRow>
        <DetailsRow label="Usuario">{log.username}</DetailsRow>
        <div className={styles.logDetailsRow}>
          <span className={styles.logDetailsLabel}>Acción</span>
          <span
            className={styles.logDetailsBadge}
            style={{ background: actionStyle?.bg, color: actionStyle?.color }}
          >
            {log.action}
          </span>
        </div>
        <DetailsRow label="Entidad">
          {ENTITY_ICONS[log.entity_type]} {log.entity_label || log.entity_type}
        </DetailsRow>
        <DetailsRow label="ID Entidad">{log.entity_id || "-"}</DetailsRow>
      </DetailsSection>

      <DetailsSection title="Request">
        <DetailsRow label="Método">{log.method}</DetailsRow>
        <DetailsRow label="Path">{log.path}</DetailsRow>
        <DetailsRow label="IP">{log.ip}</DetailsRow>
        <DetailsRow label="Duración">{log.duration ? `${log.duration}ms` : "-"}</DetailsRow>
      </DetailsSection>

      {details.statusCode && (
        <DetailsSection title="Estado">
          <DetailsRow label="Status Code">{details.statusCode}</DetailsRow>
        </DetailsSection>
      )}

      {details.response && (
        <div className={styles.logDetailsSection}>
          <h4>Response</h4>
          <pre className={styles.logDetailsPre}>{JSON.stringify(details.response, null, 2)}</pre>
        </div>
      )}

      {log.user_agent && (
        <div className={styles.logDetailsSection}>
          <h4>User Agent</h4>
          <div className={styles.logDetailsUserAgent}>{log.user_agent}</div>
        </div>
      )}
    </div>
  );
}
