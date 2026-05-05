import { useRef } from "react";
import { useParams } from "react-router-dom";
import { useMenu } from "../hooks/useMenu";

function DirectARViewer() {
  const { menu, loading } = useMenu();
  const { itemId } = useParams();
  const item = menu.find((item) => item.id === itemId);

  const modelViewerRef = useRef(null);

  const launchAr = () => {
    if (modelViewerRef.current) {
      modelViewerRef.current.activateAR(); // Misma función que usas en MenuCard.jsx
    }
  };

  if (loading) return <div style={styles.center}>Cargando experiencia AR...</div>;
  // Si el plato no existe o no tiene modelo, mostramos un mensaje simple.
  if (!item || !item.modelAR) return <div style={styles.center}>Modelo no encontrado</div>;

  return (
    <div style={styles.fullScreenContainer}>
      <model-viewer
        ref={modelViewerRef}
        src={item.modelAR}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate
        style={styles.viewer}
      >
        {/* slot="ar-button" reemplaza el boton AR default de model-viewer.
            Nuestro boton es mas grande y llamativo, optimizado para que el
            cliente lo vea claramente en mobile despues de escanear el QR. */}
        <button slot="ar-button" style={styles.arButton} onClick={launchAr}>
          Ver en mi mesa
        </button>
      </model-viewer>
    </div>
  );
}

// Estilos inline porque este componente es full-screen y no comparte nada
// con el resto del menu. Mantenerlo aislado simplifica.
const styles = {
  fullScreenContainer: {
    width: "100vw",
    height: "100vh",
    backgroundColor: "#000",
    display: "flex",
    flexDirection: "column",
  },
  viewer: {
    width: "100%",
    height: "100%",
  },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    color: "#fff",
    fontFamily: "sans-serif",
  },
  arButton: {
    position: "absolute",
    bottom: "30px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "15px 30px",
    backgroundColor: "#ff4757", // Tu color primario o uno que destaque
    color: "white",
    border: "none",
    borderRadius: "25px",
    fontSize: "18px",
    fontWeight: "bold",
    boxShadow: "0px 4px 10px rgba(0,0,0,0.5)",
    cursor: "pointer",
    zIndex: 10,
  },
};

export default DirectARViewer;
