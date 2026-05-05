import styles from "./LoadingState.module.css";

export function LoadingState({ message = "Cargando..." }) {
  return <div className={styles.loading}>{message}</div>;
}
