// Componente que sube archivos DIRECTAMENTE a Cloudinary desde el navegador
// (sin pasar por nuestro backend). Esto lo hacemos asi porque Cloudinary tiene
// un sistema de "unsigned upload presets" que permite que clientes publicos
// suban archivos sin necesidad de firmar con la API secret. El secret nunca
// sale del server.
//
// Flujo:
//   1. User elige archivo
//   2. Frontend manda a cloudinary.com/v1_1/xxx/image(o raw)/upload
//   3. Cloudinary devuelve la URL publica
//   4. Frontend llama a nuestro backend para registrar esa URL en Supabase
//
// Cuando se borra, el backend borra de Cloudinary ademas de Supabase (ahi si
// necesita el API secret).

import { useRef, useState, useEffect } from "react";
import { createImagenAsset, createModeloAsset } from "./api";

// Las credenciales de Cloudinary vienen del .env. Los defaults son los del
// proyecto Route 66, dejamos fallback por si el .env no esta cargado bien.
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "dxpam0kqa";
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "HublabMenuWebAr";
const CLOUDINARY_UPLOAD_FOLDER = import.meta.env.VITE_CLOUDINARY_UPLOAD_FOLDER || "uploads";
// Los .glb van a una subcarpeta /models para tenerlos separados de las fotos.
const CLOUDINARY_MODELS_FOLDER = `${CLOUDINARY_UPLOAD_FOLDER}/models`;

// Construye un id unico para el asset. Toma el nombre del archivo, lo limpia
// (solo letras/numeros/guiones, minusculas) y le agrega un timestamp en base
// 36 al final para garantizar unicidad aunque se suba el mismo archivo dos
// veces.
function buildAssetId(fileName, prefix) {
  const baseName = fileName.replace(/\.[^/.]+$/, "").toLowerCase();
  const sanitized = baseName
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36);
  return `${prefix}_${sanitized || "asset"}_${suffix}`;
}

// Toma "hamburguesa.jpg" y devuelve "hamburguesa" como label legible.
function buildAssetLabel(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").trim() || "Archivo";
}

export default function AdminUploader({ onUploadComplete }) {
  // Refs a los inputs file para poder limpiarlos programaticamente despues
  // del upload (sin esto, el input recordaria el ultimo archivo elegido).
  const imageInputRef = useRef(null);
  const modelInputRef = useRef(null);

  // Estados separados para imagen y modelo porque el uploader maneja los dos
  // flujos en paralelo (el user puede tener ambos selects abiertos).
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

  // Genera el preview de la imagen con URL.createObjectURL. Es importante
  // revocarla en el cleanup para no filtrar memoria (son URLs en blob).
  useEffect(() => {
    if (!imageFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Mensaje de error mas claro para el caso mas tipico: el preset no existe.
  // Suele pasar cuando se olvidaron de crearlo en el dashboard de Cloudinary.
  const handleUploadError = (message) => {
    if (message.toLowerCase().includes("upload preset not found")) {
      return `Cloudinary no encuentra el preset "${CLOUDINARY_UPLOAD_PRESET}". Crealo como Unsigned en Settings > Upload > Upload presets.`;
    }
    return message;
  };

  // Chequea que las env vars esten definidas antes de intentar subir. Si
  // faltan, el mensaje le dice al user que reinicie Vite (porque Vite lee las
  // env vars solo al arrancar).
  const ensureCloudinaryConfig = () => {
    const missingVariables = [];
    if (!CLOUDINARY_CLOUD_NAME) missingVariables.push("VITE_CLOUDINARY_CLOUD_NAME");
    if (!CLOUDINARY_UPLOAD_PRESET) missingVariables.push("VITE_CLOUDINARY_UPLOAD_PRESET");

    if (missingVariables.length > 0) {
      setError(
        `Falta configurar: ${missingVariables.join(", ")}. Si acabas de editar .env, reinicia npm run dev.`,
      );
      return false;
    }
    return true;
  };

  // Funcion core del upload. resourceType es "image" para imagenes o "raw"
  // para .glb (Cloudinary trata los 3D como recursos raw porque no son
  // manipulables como imagen).
  const uploadToCloudinary = async (file, resourceType, folder) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      { method: "POST", body: formData },
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Error al subir archivo a Cloudinary");
    }
    return payload.secure_url;
  };

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
    // Pre-llenamos el input del nombre con el nombre del archivo, el user
    // puede editarlo despues si quiere uno mas descriptivo.
    setCustomImageName(file ? buildAssetLabel(file.name) : "");
    setImageURL("");
    setError("");
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setCustomImageName("");
    setImageURL("");
    setError("");
    // Reseteamos el input file para que el user pueda elegir el MISMO archivo
    // de nuevo si quiere (sin esto, onChange no se dispara).
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleModelFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setModelFile(file);
    setCustomModelName(file ? buildAssetLabel(file.name) : "");
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

  // Flujo completo de subir imagen:
  //   1. Sube a Cloudinary -> recibe URL
  //   2. Registra en BD via nuestro backend
  //   3. Notifica al dashboard para que recargue
  //   4. Limpia el form
  const handleImageUpload = async () => {
    if (!imageFile) {
      setError("Selecciona una imagen primero.");
      return;
    }
    if (!customImageName.trim()) {
      setError("El nombre de la imagen no puede estar vacío.");
      return;
    }
    if (!ensureCloudinaryConfig()) return;

    setImageUploading(true);
    setError("");
    setImageURL("");

    try {
      const url = await uploadToCloudinary(imageFile, "image", CLOUDINARY_UPLOAD_FOLDER);
      const savedImage = await createImagenAsset({
        id: buildAssetId(customImageName, "img"),
        label: customImageName.trim(),
        url,
      });

      setImageURL(savedImage.src || url);
      onUploadComplete?.(savedImage, "image");

      setImageFile(null);
      setCustomImageName("");
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (uploadError) {
      const message = uploadError?.message || "No se pudo subir la imagen";
      setError(handleUploadError(message));
    } finally {
      setImageUploading(false);
    }
  };

  // Mismo flujo que la imagen pero con validacion extra de extension .glb.
  const handleModelUpload = async () => {
    if (!modelFile) {
      setError("Selecciona un modelo .glb primero.");
      return;
    }
    // Cloudinary acepta cualquier archivo como "raw", pero nosotros solo
    // queremos .glb para que el model-viewer los pueda cargar.
    if (!modelFile.name.toLowerCase().endsWith(".glb")) {
      setError("El modelo AR debe tener extensión .glb");
      return;
    }
    if (!customModelName.trim()) {
      setError("El nombre del modelo no puede estar vacío.");
      return;
    }
    if (!ensureCloudinaryConfig()) return;

    setModelUploading(true);
    setError("");
    setModelURL("");

    try {
      const url = await uploadToCloudinary(modelFile, "raw", CLOUDINARY_MODELS_FOLDER);
      const savedModel = await createModeloAsset({
        id: buildAssetId(customModelName, "mdl"),
        label: customModelName.trim(),
        url,
      });

      setModelURL(savedModel.src || url);
      onUploadComplete?.(savedModel, "model");

      setModelFile(null);
      setCustomModelName("");
      if (modelInputRef.current) modelInputRef.current.value = "";
    } catch (uploadError) {
      const message = uploadError?.message || "No se pudo subir el modelo .glb";
      setError(handleUploadError(message));
    } finally {
      setModelUploading(false);
    }
  };

  // NOTA: todos los estilos estan inline. Fue una decision deliberada porque
  // este componente es bastante auto-contenido y no compartia estilos con
  // nada mas. Si crece mas vale la pena moverlo a un CSS module.
  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720, width: "100%" }}>
      <h2 style={{ margin: 0, color: "#d4aa63" }}>Subir Archivos a Cloudinary</h2>

      {/* ==================== Bloque de IMAGEN ==================== */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <h3 style={{ margin: 0, color: "#f7f1e8", fontSize: "1rem" }}>Imagen del menú</h3>

        {/* Input file oculto, se activa via el boton de abajo */}
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
            {/* Preview de la imagen con boton X para descartarla */}
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

      {/* Separador visual entre los dos bloques */}
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
              {/* No hay preview visual del .glb porque seria demasiado caro
                  renderizarlo aca. Mostramos un placeholder con icono. */}
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
