// Seccion de platos. Recibe un titulo (label de la categoria activa) y la
// lista de items de esa categoria, y los renderea en un grid.
//
// Incluye un filtro de ingredientes en el mismo container: junta todos los
// ingredientes presentes en los items de la categoria, y permite al cliente
// DESMARCAR los que no quiere o le dan alergia. Cualquier plato que contenga
// un ingrediente excluido se oculta del grid.
//
// El estado del filtro se resetea al cambiar de categoria (via key={title}),
// porque los ingredientes disponibles cambian con cada categoria.
//
// Detalle: usamos `key={title}` en el div del grid para forzar a React a
// remontarlo cuando cambia la categoria. Eso reinicia la animacion fadeIn
// asi cada vez que el user cambia de tab se ven los platos aparecer.

import { useMemo, useState } from "react";
import MenuCard from "./MenuCard";
import IngredientFilter from "./IngredientFilter";
import styles from "./MenuSection.module.css";

function MenuSection({ title, items }) {
  // Ingredientes excluidos por el cliente (los que desmarco). Se guarda como
  // Set para lookups O(1) al filtrar.
  const [excluded, setExcluded] = useState(() => new Set());

  // Lista unica y ordenada de ingredientes presentes en la categoria actual.
  const availableIngredients = useMemo(() => {
    const set = new Set();
    for (const item of items) {
      if (Array.isArray(item.ingredients)) {
        for (const ing of item.ingredients) {
          if (typeof ing === "string" && ing.trim()) set.add(ing.trim());
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  // Platos visibles: se ocultan los que contengan algun ingrediente excluido.
  const visibleItems = useMemo(() => {
    if (excluded.size === 0) return items;
    return items.filter((item) => {
      if (!Array.isArray(item.ingredients)) return true;
      return !item.ingredients.some((ing) => excluded.has(ing?.trim?.() ?? ing));
    });
  }, [items, excluded]);

  const toggleIngredient = (ingredient) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(ingredient)) next.delete(ingredient);
      else next.add(ingredient);
      return next;
    });
  };

  const clearFilter = () => setExcluded(new Set());

  return (
    <section className={styles.menuSection} id="menu">
      <h2 className={styles.title}>{title}</h2>

      <IngredientFilter
        ingredients={availableIngredients}
        excluded={excluded}
        onToggle={toggleIngredient}
        onClear={clearFilter}
      />

      {visibleItems.length > 0 ? (
        <div key={title} className={`${styles.menuGrid} ${styles.fadeIn}`}>
          {visibleItems.map((item) => (
            <MenuCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className={styles.emptyMessage}>
          Ningún plato coincide con los ingredientes seleccionados.
        </p>
      )}
    </section>
  );
}

export default MenuSection;