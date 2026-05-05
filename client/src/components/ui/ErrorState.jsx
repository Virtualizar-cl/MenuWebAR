import styles from "./ErrorState.module.css";

export function ErrorState({ message }) {
  return <div className={styles.errorMsg}>{message}</div>;
}
