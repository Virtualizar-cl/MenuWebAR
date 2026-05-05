import styles from "./KpiCard.module.css";

export function KpiCard({ value, label, sublabel, highlight }) {
  return (
    <div className={`${styles.kpiCard} ${highlight ? styles.kpiCardAlert : ""}`}>
      <div className={styles.kpiValue}>{value ?? 0}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sublabel && <div className={styles.kpiSublabel}>{sublabel}</div>}
    </div>
  );
}
