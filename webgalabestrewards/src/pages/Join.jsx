import { useState } from "react";
import { auth, db } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function Join() {
  const [name, setName] = useState("");
  const [lastname, setLastname] = useState("");
  const [profileFile, setProfileFile] = useState(null);
  const [winnerFile, setWinnerFile] = useState(null);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [gender, setGender] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // MODAL INFO FOTO PERFIL
  const [showInfoProfile, setShowInfoProfile] = useState(false);

  const navigate = useNavigate();

  const addDebug = (message, details) => {
    const detailText = details
      ? typeof details === "string"
        ? details
        : JSON.stringify(details, null, 2)
      : "";

    const entry = `${new Date().toISOString()} - ${message}${detailText ? `\n${detailText}` : ""}`;
    setDebugInfo((prev) => [entry, prev].filter(Boolean).join("\n\n"));
    console.log(entry);
  };

  const compressImageForUpload = async (file) => {
    if (!file || typeof file.name !== "string") {
      throw new Error("El archivo seleccionado no es válido.");
    }

    const lowerName = file.name.toLowerCase();
    const ext = lowerName.split(".").pop();
    const imageExtensions = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "heic", "heif", "svg", "avif"];
    const isImage = file.type.startsWith("image/") || imageExtensions.includes(ext);

    if (!isImage) {
      addDebug("No se comprimirá porque no es un formato de imagen conocido", { name: file.name, type: file.type });
      return file;
    }

    const isHeic = file.type === "image/heic" || ext === "heic" || ext === "heif";

    if (isHeic) {
      addDebug("HEIC/HEIF detectado, se sube sin comprimir", { name: file.name, type: file.type, size: file.size });
      return file;
    }

    if (file.size < 1500000) {
      addDebug("Imagen pequeña, no se comprime", { name: file.name, type: file.type, size: file.size });
      return file;
    }

    try {
      const imageBitmap = await createImageBitmap(file);
      const maxDimension = 1200;
      let { width, height } = imageBitmap;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.75);
      });

      if (!blob) {
        throw new Error("No se pudo generar el blob de imagen");
      }

      const newName = file.name.replace(/\.[^/.]+$/, ".jpg");
      addDebug("Imagen comprimida", {
        original: { name: file.name, type: file.type, size: file.size },
        compressed: { name: newName, type: "image/jpeg", size: blob.size },
      });
      return new File([blob], newName, { type: "image/jpeg" });
    } catch (err) {
      addDebug("Falló la compresión, se usa el archivo original", {
        error: err?.message || err,
        name: file.name,
        type: file.type,
        size: file.size,
      });
      return file;
    }
  };

  const uploadLocal = async (file) => {
    if (!file || typeof file.name !== "string") {
      throw new Error("El archivo seleccionado no es válido.");
    }

    const uploadFile = await compressImageForUpload(file);

    addDebug("Preparando subida", {
      name: uploadFile.name,
      type: uploadFile.type,
      size: uploadFile.size,
    });

    const formData = new FormData();
    formData.append("file", uploadFile, uploadFile.name);

    let response;
    try {
      response = await fetch("https://gala-backend.franrvguijo.workers.dev/upload", {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      addDebug("Fetch a /upload falló", err?.message || err);
      throw new Error(`Error de red al subir imagen: ${err?.message || err}`);
    }

    if (!response.ok) {
      const text = await response.text();
      addDebug("Error en respuesta de upload", { status: response.status, body: text });
      throw new Error(`Error al subir imagen: ${response.status} ${text}`);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      addDebug("Respuesta no JSON", { text, error: err?.message || err });
      throw new Error("Respuesta inválida del servidor de imágenes.");
    }

    if (!data?.fileName) {
      addDebug("Falta fileName en respuesta", data);
      throw new Error("Respuesta inválida del servidor de imágenes.");
    }

    addDebug("Upload completado", data);
    return data.fileName;
  };

  const joinGala = async () => {
    setError("");
    setIsLoading(true);

    if (!name || !lastname || !profileFile || !winnerFile || !gender) {
      setError("Por favor completa todos los campos.");
      setIsLoading(false);
      return;
    }

    try {
      try {
        await auth.signOut();
      } catch (err) {
        // Ignorar si no hay sesión activa.
      }

      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;

      const profilePhotoName = await uploadLocal(profileFile);
      const winnerPhotoName = await uploadLocal(winnerFile);

      await setDoc(doc(db, "users", user.uid), {
        name,
        lastname,
        gender,
        profilePhoto: profilePhotoName,
        winnerPhoto: winnerPhotoName,
        role: "voter",
        joinedSessionId: null,
        connected: true,
        lastSeen: serverTimestamp(),
        votes: 0,
      });

      sessionStorage.setItem("voterId", user.uid);
      sessionStorage.setItem("voterAuth", "true");
      navigate("/voter");
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al unirse a la gala. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const exitPage = () => {
    const confirmExit = window.confirm("¿Seguro que quieres salir?");
    if (confirmExit) navigate("/");
  };

  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #3f1dcb, #1a73e8, #ffffff, #ff66cc)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <style>
        {`
          html, body {
            overflow: hidden;
            height: 100%;
          }

          @keyframes modalFade {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
        `}
      </style>

      {/* Botón salir arriba derecha */}
      <button
        onClick={exitPage}
        style={{
          position: "absolute",
          top: "15px",
          right: "15px",
          padding: "8px 18px",
          background: "rgba(0,0,0,0.4)",
          border: "none",
          borderRadius: "999px",
          color: "white",
          fontSize: "14px",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        Salir
      </button>

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(255,255,255,0.10)",
          borderRadius: "20px",
          padding: "25px 20px",
          border: "1px solid rgba(255,255,255,0.24)",
          boxShadow: "0 0 28px rgba(0,0,0,0.26)",
          backdropFilter: "blur(16px)",
        }}
      >
        <h1
          style={{
            color: "white",
            textShadow: "0 0 10px white",
            fontSize: "24px",
            marginBottom: "10px",
          }}
        >
          Unirse a la Gala Best Rewards
        </h1>

        {error && (
          <div
            style={{
              background: "rgba(255,0,0,0.4)",
              padding: "10px",
              borderRadius: "10px",
              color: "white",
              fontWeight: "bold",
              marginBottom: "10px",
              whiteSpace: "pre-wrap",
              textAlign: "left",
            }}
          >
            {error}
          </div>
        )}

        {debugInfo && (
          <div
            style={{
              background: "rgba(0,0,0,0.5)",
              padding: "10px",
              borderRadius: "10px",
              color: "white",
              fontSize: "12px",
              lineHeight: "1.4",
              maxHeight: "220px",
              overflowY: "auto",
              textAlign: "left",
              marginBottom: "10px",
            }}
          >
            <strong>Debug info:</strong>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{debugInfo}</pre>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "10px",
          }}
        >
          {/* Nombre */}
          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            🧑 Nombre
          </div>
          <input
            type="text"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: "12px",
              fontSize: "16px",
              borderRadius: "12px",
              border: "none",
              width: "92%",
            }}
          />

          {/* Apellidos */}
          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            👤 Apellidos
          </div>
          <input
            type="text"
            placeholder="Apellidos"
            value={lastname}
            onChange={(e) => setLastname(e.target.value)}
            style={{
              padding: "12px",
              fontSize: "16px",
              borderRadius: "12px",
              border: "none",
              width: "92%",
            }}
          />

          {/* Selector de género */}
          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            ⚧ Sexo
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "10px",
              marginTop: "5px",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => setGender("male")}
              style={{
                padding: "12px 20px",
                borderRadius: "12px",
                border:
                  gender === "male"
                    ? "2px solid rgba(56,189,248,0.95)"
                    : "2px solid rgba(255,255,255,0.3)",
                background:
                  gender === "male"
                    ? "rgba(56,189,248,0.22)"
                    : "rgba(255,255,255,0.15)",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backdropFilter: "blur(6px)",
                transition: "all 0.3s ease",
              }}
            >
              ♂️ Chico
            </button>

            <button
              onClick={() => setGender("female")}
              style={{
                padding: "12px 20px",
                borderRadius: "12px",
                border:
                  gender === "female"
                    ? "2px solid rgba(244,114,182,0.95)"
                    : "2px solid rgba(255,255,255,0.3)",
                background:
                  gender === "female"
                    ? "rgba(244,114,182,0.22)"
                    : "rgba(255,255,255,0.15)",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backdropFilter: "blur(6px)",
                transition: "all 0.3s ease",
              }}
            >
              ♀️ Chica
            </button>
          </div>

          {/* Foto de perfil con icono de información */}
          <div
            style={{
              textAlign: "left",
              color: "white",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            📸 Foto de Perfil
            <span
              onClick={() => setShowInfoProfile(true)}
              style={{
                cursor: "pointer",
                fontSize: "18px",
                color: "gold",
                textShadow: "0 0 6px gold",
              }}
            >
              ℹ️
            </span>
          </div>

          <input
            type="file"
            accept="image/*,.heic,.heif,.jpeg,.jpg,.png,.webp,.bmp,.tiff,.avif"
            onChange={(e) => setProfileFile(e.target.files[0])}
            style={{ width: "100%" }}
          />

          {/* Foto para ganador */}
          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            🏆 Foto para Ganador
          </div>
          <input
            type="file"
            accept="image/*,.heic,.heif,.jpeg,.jpg,.png,.webp,.bmp,.tiff,.avif"
            onChange={(e) => setWinnerFile(e.target.files[0])}
            style={{ width: "100%" }}
          />

          {/* Botón entrar */}
          <button
            onClick={joinGala}
            disabled={isLoading}
            style={{
              padding: "14px",
              fontSize: "18px",
              background: isLoading ? "rgba(255,215,0,0.5)" : "gold",
              border: "none",
              borderRadius: "14px",
              cursor: isLoading ? "default" : "pointer",
              boxShadow: "0 0 20px gold",
              marginTop: "10px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "10px",
            }}
          >
            {isLoading ? "Subiendo..." : "🚀 Entrar"}
          </button>
        </div>
      </div>

      {/* MODAL INFO FOTO PERFIL */}
      {showInfoProfile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            animation: "modalFade 0.3s ease",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              padding: "25px",
              borderRadius: "20px",
              width: "85%",
              maxWidth: "380px",
              color: "white",
              textAlign: "center",
              boxShadow: "0 0 20px gold",
              backdropFilter: "blur(10px)",
            }}
          >
            <h2 style={{ marginBottom: "10px", textShadow: "0 0 8px gold" }}>
              📸 ¿Por qué pedimos esta foto?
            </h2>

            <p style={{ fontSize: "15px", lineHeight: "22px" }}>
              La foto de perfil se usa para mostrar:
              <br />
              ⭐ Los nominados
              <br />
              ⭐ Los usuarios conectados
              <br />
              ⭐ Y si ganas… ¡tu foto aparecerá como GANADOR!
              <br />
              <br />
              Por eso es importante que sea una foto clara, bonita y bien iluminada.
            </p>

            <button
              onClick={() => setShowInfoProfile(false)}
              style={{
                marginTop: "15px",
                padding: "10px 20px",
                background: "gold",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                fontWeight: "bold",
                boxShadow: "0 0 15px gold",
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
