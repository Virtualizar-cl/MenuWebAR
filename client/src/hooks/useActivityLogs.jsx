import { useState, useCallback } from "react";
import { getActivityLogs } from "../services/logs/getActivityLogs";
import { clearActivityLogs } from "../services/logs/clearActivityLogs";

export function useActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ action: "", entityType: "" });
  const [offset, setOffset] = useState(0);

  const limit = 30;

  const loadLogs = useCallback(
    async (pageOffset = 0, customFilters = null) => {
      setLoading(true);
      setError("");
      try {
        const activeFilters = customFilters || filters;
        const data = await getActivityLogs({
          limit,
          offset: pageOffset,
          action: activeFilters.action || undefined,
          entityType: activeFilters.entityType || undefined,
        });
        setLogs(data);
        setOffset(pageOffset);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  const clearLogs = useCallback(async () => {
    try {
      await clearActivityLogs();
      setLogs([]);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const applyFilter = useCallback(
    (key, value) => {
      const newFilters = { ...filters, [key]: value };
      setFilters(newFilters);
      loadLogs(0, newFilters);
    },
    [filters, loadLogs],
  );

  const nextPage = useCallback(() => loadLogs(offset + limit), [loadLogs, offset, limit]);
  const prevPage = useCallback(
    () => loadLogs(Math.max(0, offset - limit)),
    [loadLogs, offset, limit],
  );

  return {
    logs,
    loading,
    error,
    filters,
    offset,
    limit,
    hasMore: logs.length === limit,
    loadLogs,
    clearLogs,
    setFilter,
    applyFilter,
    nextPage,
    prevPage,
  };
}
