import styles from "./IngredientsModal.module.css";
import { Modal } from "./Modal";

export const IngredientsModal = ({ isOpen, close, item }) => {
  return (
    <Modal isOpen={isOpen} close={close} title="Ingredientes" fitContent>
      <div className={styles.ingredientsContainer}>
        {item.ingredients && item.ingredients.length > 0 ? (
          <ul className={styles.ingredientsList}>
            {item.ingredients.map((ingredient, index) => (
              <li key={index} className={styles.ingredientItem}>
                <span className={styles.ingredientNumber}>{index + 1}</span>
                <span className={styles.ingredientText}>{ingredient}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.noIngredientsMessage}>
            <span className={styles.noIngredientsIcon}>🍽️</span>
            <p>No hemos actualizado los ingredientes</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
