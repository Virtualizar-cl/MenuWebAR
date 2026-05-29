import { useRef, useState, useEffect } from "react";
import { createImagenAsset, createModeloAsset } from "./api";

export default function AdminUploader({ onUploadComplete }) {
  const imageInputRef = useRef(null);
  const modelInputRef = useRef(null);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [customImageName, setCustomImageName] = useState("");

  const [modelFile, setModelFile] = useState(null);
  const [customModelName, setCustomModelName] = useState("");

  const [imageUploading, setImageUploading] = useState(false);
  const [modelUploading, setModelUploading] = useState(false);
  const [imageURL, setImageURL] = useState("");
  const [modelURL, setModelURL] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
    setCustomImageName(file ? file.name.replace(/\.[^/.]+$/, "").trim() || "Imagen" : "");
    setImageURL("");
    setError("");
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setCustomImageName("");
    setImageURL("");
    setError("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleModelFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setModelFile(file);
    setCustomModelName(file ? file.name.replace(/\.[^/.]+$/, "").trim() || "Modelo" : "");
    setModelURL("");
    setError("");
  };

  const handleRemoveModel = () => {
    setModelFile(null);
    setCustomModelName("");
    setModelURL("");
    setError("");
    if (modelInputRef.current) modelInputRef.current.value = "";
  };

  const handleImageUpload = async () => {
    if (!imageFile) {
      setError("Selecciona una imagen primero.");
      return;
    }
    if (!customImageName.trim()) {
      setError("El nombre de la imagen no puede estar vacío.");
      return;
    }

    setImageUploading(true);
    setError("");
    setImageURL("");

    try {
      const savedImage = await createImagenAsset(imageFile, customImageName.trim());

      setImageURL(savedImage.src);
      onUploadComplete?.(savedImage, "image");

      setImageFile(null);
      setCustomImageName("");
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (uploadError) {
      setError(uploadError?.message || "No se pudo subir la imagen");
    } finally {
      setImageUploading(false);
    }
  };

  const handleModelUpload = async () => {
    if (!modelFile) {
      setError("Selecciona un modelo .glb primero.");
      return;
    }
    if (!modelFile.name.toLowerCase().endsWith(".glb")) {
      setError("El modelo AR debe tener extensión .glb");
      return;
    }
    if (!customModelName.trim()) {
      setError("El nombre del modelo no puede estar vacío.");
      return;
    }

    setModelUploading(true);
    setError("");
    setModelURL("");

    try {
      const savedModel = await createModeloAsset(modelFile, customModelName.trim());

      setModelURL(savedModel.src);
      onUploadComplete?.(savedModel, "model");

      setModelFile(null);
      setCustomModelName("");
      if (modelInputRef.current) modelInputRef.current.value = "";
    } catch (uploadError) {
      setError(uploadError?.message || "No se pudo subir el modelo .glb");
    } finally {
      setModelUploading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720, width: "100%" }}>
      <h2 style={{ margin: 0, color: "#d4aa63" }}>Subir Archivos</h2>

      {/* ==================== Bloque de IMAGEN ==================== */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <h3 style={{ margin: 0, color: "#f7f1e8", fontSize: "1rem" }}>Imagen del menú</h3>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFileChange}
          style={{ display: "none" }}
        />

        {!imageFile && (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#f7f1e8",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 8,
              padding: "0.65rem 1rem",
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            Elegir imagen
          </button>
        )}

        {imageFile && imagePreview && (
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(212, 170, 99, 0.2)",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <div style={{ position: "relative", display: "inline-block", alignSelf: "center" }}>
              <img
                src={imagePreview}
                alt="Vista previa"
                style={{
                  maxWidth: 320,
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "block",
                }}
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={imageUploading}
                title="Quitar imagen y elegir otra"
                style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "2px solid #0f1724",
                  background: "#ff4444",
                  color: "#fff",
                  fontSize: "1rem",
                  fontWeight: 700,
                  cursor: imageUploading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  opacity: imageUploading ? 0.5 : 1,
                }}
              >
                ✕
              </button>
            </div>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                fontSize: "0.8rem",
                color: "rgba(255, 255, 255, 0.6)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Nombre de la imagen
              <input
                type="text"
                value={customImageName}
                onChange={(e) => setCustomImageName(e.target.value)}
                disabled={imageUploading}
                placeholder="Ej: Hamburguesa Clásica"
                style={{
                  background: "rgba(255, 255, 255, 0.07)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
                  color: "#d4aa63",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                }}
              />
            </label>

            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>
              Archivo: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleImageUpload}
                disabled={imageUploading || !customImageName.trim()}
                style={{
                  background: "linear-gradient(135deg, #d4aa63, #c49a52)",
                  color: "#0f1724",
                  border: "none",
                  borderRadius: 8,
                  padding: "0.65rem 1rem",
                  fontWeight: 700,
                  cursor: imageUploading || !customImageName.trim() ? "not-allowed" : "pointer",
                  opacity: imageUploading || !customImageName.trim() ? 0.6 : 1,
                }}
              >
                {imageUploading ? "Subiendo..." : "Subir imagen"}
              </button>
            </div>
          </div>
        )}

        {imageURL && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <p style={{ margin: 0, color: "#6ee7a7" }}>Imagen subida correctamente.</p>
            <a
              href={imageURL}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#7cc7ff", wordBreak: "break-all" }}
            >
              {imageURL}
            </a>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.15)" }} />

      {/* ==================== Bloque de MODELO 3D ==================== */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <h3 style={{ margin: 0, color: "#f7f1e8", fontSize: "1rem" }}>Modelo AR (.glb)</h3>

        <input
          ref={modelInputRef}
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={handleModelFileChange}
          style={{ display: "none" }}
        />

        {!modelFile && (
          <button
            type="button"
            onClick={() => modelInputRef.current?.click()}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#f7f1e8",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 8,
              padding: "0.65rem 1rem",
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            Elegir modelo .glb
          </button>
        )}

        {modelFile && (
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(212, 170, 99, 0.2)",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <div style={{ position: "relative", display: "inline-block", alignSelf: "center" }}>
              <div
                style={{
                  width: 320,
                  maxWidth: "100%",
                  height: 160,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background:
                    "linear-gradient(135deg, rgba(212, 170, 99, 0.12), rgba(212, 170, 99, 0.04))",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  color: "#d4aa63",
                }}
              >
                <div style={{ fontSize: "2.5rem" }}>📦</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Modelo 3D .glb</div>
              </div>
              <button
                type="button"
                onClick={handleRemoveModel}
                disabled={modelUploading}
                title="Quitar modelo y elegir otro"
                style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "2px solid #0f1724",
                  background: "#ff4444",
                  color: "#fff",
                  fontSize: "1rem",
                  fontWeight: 700,
                  cursor: modelUploading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  opacity: modelUploading ? 0.5 : 1,
                }}
              >
                ✕
              </button>
            </div>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                fontSize: "0.8rem",
                color: "rgba(255, 255, 255, 0.6)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Nombre del modelo
              <input
                type="text"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                disabled={modelUploading}
                placeholder="Ej: Hamburguesa 3D"
                style={{
                  background: "rgba(255, 255, 255, 0.07)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 8,
                  padding: "0.65rem 0.85rem",
                  color: "#d4aa63",
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                }}
              />
            </label>

            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>
              Archivo: {modelFile.name} ({(modelFile.size / 1024).toFixed(1)} KB)
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleModelUpload}
                disabled={modelUploading || !customModelName.trim()}
                style={{
                  background: "linear-gradient(135deg, #d4aa63, #c49a52)",
                  color: "#0f1724",
                  border: "none",
                  borderRadius: 8,
                  padding: "0.65rem 1rem",
                  fontWeight: 700,
                  cursor: modelUploading || !customModelName.trim() ? "not-allowed" : "pointer",
                  opacity: modelUploading || !customModelName.trim() ? 0.6 : 1,
                }}
              >
                {modelUploading ? "Subiendo..." : "Subir modelo AR"}
              </button>
            </div>
          </div>
        )}

        <p style={{ margin: 0, color: "rgba(212, 170, 99, 0.8)", fontSize: "0.85rem" }}>
          Acepta solo archivos .glb
        </p>

        {modelURL && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <p style={{ margin: 0, color: "#6ee7a7" }}>Modelo .glb subido correctamente.</p>
            <a
              href={modelURL}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#7cc7ff", wordBreak: "break-all" }}
            >
              {modelURL}
            </a>
          </div>
        )}
      </div>

      {error && <p style={{ margin: 0, color: "#ff6b6b" }}>{error}</p>}
    </div>
  );
}
