// Skeletons (placeholders animados) que se muestran mientras se cargan los
// platos del backend. Da mejor sensacion de velocidad que un spinner porque
// el user ya ve la "forma" de lo que va a aparecer.
//
// Exportamos MenuSkeleton: grid con N skeletons (lo que usa App.jsx).

import styles from "./MenuCardSkeleton.module.css";

function MenuCardSkeleton() {
  return (
    // aria-hidden porque los skeletons no aportan info, son visuales puros.
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonImage} />
      <div className={styles.skeletonContent}>
        <div className={styles.skeletonTitle} />
        <div className={styles.skeletonText} />
        {/* La segunda linea va al 60% para simular que no todas las
            descripciones tienen el mismo largo. */}
        <div className={styles.skeletonText} style={{ width: "60%" }} />
        <div className={styles.skeletonFooter}>
          <div className={styles.skeletonPrice} />
          <div className={styles.skeletonActions} />
        </div>
      </div>
    </div>
  );
}

// Wrapper que renderea N skeletons en un grid. count default = 6 que es lo
// que entra en pantalla en desktop sin scrollear.
export function MenuSkeleton({ count = 6 }) {
  return (
    <div className={styles.skeletonGrid}>
      {Array.from({ length: count }, (_, i) => (
        <MenuCardSkeleton key={i} />
      ))}
    </div>
  );
}
