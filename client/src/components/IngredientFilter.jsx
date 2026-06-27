// Filtro de ingredientes para la categoria activa. Recibe la lista de
// ingredientes disponibles (ya deduplicada por MenuSection), el set de
// ingredientes excluidos y los callbacks para marcar/desmarcar y limpiar.
// El cliente DESMARCA lo que no quiere o le da alergia; un plato que contenga
// cualquier ingrediente desmarcado se oculta del grid.

import { useEffect, useRef, useState } from "react";
import styles from "./IngredientFilter.module.css";

function IngredientFilter({ ingredients, excluded, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Cierra el panel al hacer click fuera o al presionar Escape.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Sin ingredientes en la categoria -> no mostramos el filtro.
  if (!ingredients || ingredients.length === 0) return null;

  const activeCount = excluded.size;

  return (
    <div className={styles.filterWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.filterBtn} ${activeCount > 0 ? styles.filterBtnActive : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Filtrar por ingredientes"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.filterIcon}>
          <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
        </svg>
        <span>Filtrar ingredientes</span>
        {activeCount > 0 && <span className={styles.filterCount}>{activeCount}</span>}
      </button>

      {open && (
        <div className={styles.filterPanel} role="menu">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Quita lo que no quieras</span>
            {activeCount > 0 && (
              <button type="button" className={styles.clearBtn} onClick={onClear}>
                Restablecer
              </button>
            )}
          </div>

          <ul className={styles.ingredientList}>
            {ingredients.map((ingredient) => {
              const checked = !excluded.has(ingredient);
              return (
                <li key={ingredient} className={styles.ingredientRow}>
                  <label className={styles.ingredientLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={checked}
                      onChange={() => onToggle(ingredient)}
                    />
                    <span className={styles.checkboxBox} aria-hidden="true">
                      <svg viewBox="0 0 24 24" className={styles.checkIcon}>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </span>
                    <span className={styles.ingredientName}>{ingredient}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default IngredientFilter;
