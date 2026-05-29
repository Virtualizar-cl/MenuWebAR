import { useEffect, useState } from "react";
import { useActivityStats } from "../hooks/useActivityStats";
import { useMenuAnalytics } from "../hooks/useMenuAnalytics";
import { KpiCard } from "../components/ui/KpiCard";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import "../components/charts/ChartProviders";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { currencyFormatter } from "../config/currencyFormatter";
import { barOptions, lineOptions, doughnutOptions } from "../components/charts/chartConfigs";
import {
  buildTrendData,
  buildByActionData,
  buildByEntityData,
  buildByHourData,
  buildDurationByDayData,
  buildByUserData,
  buildCategoriasData,
  buildIngredientsData,
} from "../components/charts/chartBuilders";
import styles from "./StatsPanel.module.css";

export default function StatsPanel() {
  const { stats, loading: statsLoading, error: statsError, loadStats } = useActivityStats();
  const {
    analytics,
    loading: analyticsLoading,
    error: analyticsError,
    loadAnalytics,
  } = useMenuAnalytics();
  const [days, setDays] = useState(7);

  useEffect(() => {
    loadStats(days);
    loadAnalytics();
  }, [days, loadAnalytics, loadStats]);

  if (statsLoading || analyticsLoading) return <LoadingState message="Cargando estadísticas..." />;
  if (statsError || analyticsError) return <ErrorState message={statsError || analyticsError} />;
  if (!stats || !analytics) return null;

  const byHourActiveCount = buildByHourData(stats.byHour).datasets[0].data.filter(
    (v) => v > 0,
  ).length;

  return (
    <div>
      <div className={styles.panelHeader}>
        <h2>Estadísticas</h2>
        <select
          className={styles.input}
          style={{ width: "auto" }}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Últimos 7 días</option>
          <option value={14}>Últimos 14 días</option>
          <option value={30}>Últimos 30 días</option>
        </select>
      </div>

      <div className={styles.statsSection}>
        <div className={styles.sectionTitle}>
          <h3>Actividad del admin</h3>
          <span className={styles.sectionSubtitle}>Acciones registradas en el período</span>
        </div>
        <div className={styles.kpiRow}>
          <KpiCard value={stats.total} label="Acciones totales" sublabel="en el período" />
          <KpiCard value={stats.users?.length} label="Usuarios activos" />
          <KpiCard value={stats.avgDuration} label="Duración prom." sublabel="ms por request" />
          <KpiCard value={stats.byEntity?.item} label="Platos modificados" />
          <KpiCard value={stats.byEntity?.category} label="Categorías modificadas" />
        </div>
        <div className={styles.chartWrapLg}>
          {Object.keys(stats.byDay || {}).length > 0 ? (
            <Line data={buildTrendData(stats.byDay)} options={lineOptions()} />
          ) : (
            <span className={styles.helperText}>Sin datos en este período</span>
          )}
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Por acción</h3>
          </div>
          <div className={styles.chartWrapMd}>
            {Object.keys(stats.byAction || {}).length > 0 ? (
              <Bar data={buildByActionData(stats.byAction)} options={barOptions()} />
            ) : (
              <span className={styles.helperText}>Sin datos</span>
            )}
          </div>
        </div>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Por entidad</h3>
          </div>
          <div className={styles.chartWrapMd}>
            {Object.keys(stats.byEntity || {}).length > 0 ? (
              <Doughnut data={buildByEntityData(stats.byEntity)} options={doughnutOptions} />
            ) : (
              <span className={styles.helperText}>Sin datos</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Duración promedio</h3>
            <span className={styles.sectionSubtitle}>{stats.avgDuration}ms media por request</span>
          </div>
          <div className={styles.chartWrapMd}>
            {Object.keys(stats.durationByDay || {}).length > 0 ? (
              <Line data={buildDurationByDayData(stats.durationByDay)} options={lineOptions()} />
            ) : (
              <span className={styles.helperText}>Sin datos</span>
            )}
          </div>
        </div>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Distribución horaria</h3>
            <span className={styles.sectionSubtitle}>{byHourActiveCount}h con actividad</span>
          </div>
          <div className={styles.chartWrapMd}>
            {byHourActiveCount > 0 ? (
              <Bar data={buildByHourData(stats.byHour)} options={barOptions()} />
            ) : (
              <span className={styles.helperText}>Sin datos</span>
            )}
          </div>
        </div>
      </div>

      {Object.keys(stats.byUser || {}).length > 1 && (
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Por usuario</h3>
          </div>
          <div className={styles.chartWrapSm}>
            <Bar
              data={buildByUserData(stats.byUser)}
              options={{
                ...barOptions(),
                plugins: { ...barOptions().plugins, legend: { display: false } },
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.panelHeader} style={{ marginTop: "2rem" }}>
        <h2>Estado del menú</h2>
      </div>

      <div className={styles.statsSection}>
        <div className={styles.sectionTitle}>
          <h3>Completitud del menú</h3>
          <span className={styles.sectionSubtitle}>Alertas de contenido incompleto</span>
        </div>
        <div className={styles.kpiRow}>
          <KpiCard value={analytics.totalPlatos} label="Total platos" />
          <KpiCard
            value={analytics.itemsWithImage}
            label="Con imagen"
            sublabel={`${analytics.itemsWithoutImage} sin imagen`}
          />
          <KpiCard
            value={analytics.itemsWithModel}
            label="Con modelo 3D"
            sublabel={`${analytics.itemsWithoutModel} sin modelo`}
            highlight={analytics.itemsWithoutModel > 0}
          />
          <KpiCard
            value={analytics.categoriesTotal - analytics.emptyCategories}
            label="Categorías activas"
            sublabel={`${analytics.emptyCategories} vacías`}
            highlight={analytics.emptyCategories > 0}
          />
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Platos por categoría</h3>
          </div>
          <div className={styles.chartWrapMd}>
            <Bar data={buildCategoriasData(analytics.categorias)} options={barOptions()} />
          </div>
        </div>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Rango de precios</h3>
          </div>
          <div className={styles.priceRangeWrap}>
            <div className={styles.priceRangeItem}>
              <span className={styles.priceRangeLabel}>Mínimo</span>
              <span className={styles.priceRangeValue}>
                {currencyFormatter.format(analytics.priceMin)}
              </span>
            </div>
            <div className={styles.priceRangeDivider} />
            <div className={styles.priceRangeItem}>
              <span className={styles.priceRangeLabel}>Máximo</span>
              <span className={styles.priceRangeValue}>
                {currencyFormatter.format(analytics.priceMax)}
              </span>
            </div>
          </div>
          {analytics.totalPlatos > 0 && (
            <div className={styles.priceAvgRow}>
              <span>Promedio:</span>
              <strong>
                {currencyFormatter.format((analytics.priceMin + analytics.priceMax) / 2)}
              </strong>
            </div>
          )}
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Ingredientes más usados</h3>
            <span className={styles.sectionSubtitle}>Top 10 del menú</span>
          </div>
          <div className={styles.chartWrapMd}>
            {analytics.topIngredients.length > 0 ? (
              <Bar
                data={buildIngredientsData(analytics.topIngredients)}
                options={{
                  ...barOptions(),
                  indexAxis: "y",
                  plugins: { ...barOptions().plugins, legend: { display: false } },
                }}
              />
            ) : (
              <span className={styles.helperText}>Sin datos</span>
            )}
          </div>
        </div>
        <div className={styles.statsSection}>
          <div className={styles.sectionTitle}>
            <h3>Modelos 3D</h3>
            <span className={styles.sectionSubtitle}>Estado de asignación AR</span>
          </div>
          <div className={styles.modelosStatsWrap}>
            <div className={styles.modelosProgress}>
              <div
                className={styles.modelosProgressBar}
                style={{
                  width: `${analytics.modelosTotal > 0 ? (analytics.modelosAssigned / analytics.modelosTotal) * 100 : 0}%`,
                }}
              />
            </div>
            <div className={styles.modelosStatsRow}>
              <div className={styles.modelosStatItem}>
                <span className={styles.modelosStatValue}>{analytics.modelosAssigned}</span>
                <span className={styles.modelosStatLabel}>Asignados</span>
              </div>
              <div className={styles.modelosStatItem}>
                <span className={styles.modelosStatValue}>{analytics.modelosUnassigned}</span>
                <span className={styles.modelosStatLabel}>Sin asignar</span>
              </div>
              <div className={styles.modelosStatItem}>
                <span className={styles.modelosStatValue}>{analytics.modelosTotal}</span>
                <span className={styles.modelosStatLabel}>Total</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
