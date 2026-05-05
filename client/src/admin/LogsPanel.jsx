import { useEffect, useState } from "react";
import { useActivityLogs } from "../hooks/useActivityLogs";
import { Modal } from "../components/Modal";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { LogDetailsContent } from "./LogDetailsModal";
import { ACTION_STYLES, ENTITY_ICONS } from "../utils/constants";
import { formatDate } from "../utils/dateUtils";
import styles from "./LogsPanel.module.css";

export default function LogsPanel() {
  const {
    logs,
    loading,
    error,
    filters,
    offset,
    hasMore,
    loadLogs,
    clearLogs,
    applyFilter,
    nextPage,
    prevPage,
  } = useActivityLogs();

  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    loadLogs(0);
  }, [loadLogs]);

  const handleClear = () => {
    if (!window.confirm("¿Limpiar todos los logs? Esta acción no se puede deshacer.")) return;
    clearLogs();
  };

  if (loading && logs.length === 0) return <LoadingState message="Cargando logs..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <Modal isOpen={!!selectedLog} close={() => setSelectedLog(null)} title="Detalles del Log">
        <LogDetailsContent log={selectedLog} />
      </Modal>

      <div className={styles.panelHeader}>
        <h2>Registro de Actividad</h2>
        <div className={styles.logsFilters}>
          <select
            className={styles.input}
            style={{ width: "auto" }}
            value={filters.action}
            onChange={(e) => applyFilter("action", e.target.value)}
          >
            <option value="">Todas las acciones</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
          <select
            className={styles.input}
            style={{ width: "auto" }}
            value={filters.entityType}
            onChange={(e) => applyFilter("entityType", e.target.value)}
          >
            <option value="">Todos los tipos</option>
            <option value="item">Platos</option>
            <option value="category">Categorías</option>
            <option value="image">Imágenes</option>
            <option value="modelo">Modelos</option>
          </select>
          <button className={styles.btnDanger} onClick={handleClear}>
            Limpiar logs
          </button>
        </div>
      </div>

      <div className={styles.logsTableWrap}>
        <table className={styles.logsTable}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Tipo</th>
              <th>Entidad</th>
              <th>ID</th>
              <th>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.logsEmpty}>
                  Sin registros
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actionStyle = ACTION_STYLES[log.action] || {};
                const entityType = log.entity_type || log.entityType;
                const entityLabel = log.entity_label || log.entityLabel;
                const entityId = log.entity_id || log.entityId;
                const createdAt = log.created_at || log.timestamp;
                return (
                  <tr key={log.id}>
                    <td className={styles.logsDate}>{formatDate(createdAt)}</td>
                    <td className={styles.logsUser}>{log.username}</td>
                    <td>
                      <span
                        className={styles.logsBadge}
                        style={{ background: actionStyle.bg, color: actionStyle.color }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span>{ENTITY_ICONS[entityType] || "📄"}</span>
                    </td>
                    <td>{entityLabel || entityType}</td>
                    <td className={styles.logsMono}>{entityId || "-"}</td>
                    <td>
                      <button className={styles.btnSmall} onClick={() => setSelectedLog(log)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {logs.length > 0 && (hasMore || offset > 0) && (
        <div className={styles.logsPagination}>
          <button className={styles.navBtn} disabled={offset === 0} onClick={prevPage}>
            ← Anterior
          </button>
          <span className={styles.logsPaginationInfo}>
            {offset + 1}-{offset + logs.length}
          </span>
          <button className={styles.navBtn} disabled={!hasMore} onClick={nextPage}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
