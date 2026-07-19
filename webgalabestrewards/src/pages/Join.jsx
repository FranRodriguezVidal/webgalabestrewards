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
      className="join-shell"
      style={{
        padding: "20px",
        textAlign: "center",
        position: "relative",
        overflowX: "hidden",
        overflowY: "auto",
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
            overflow-x: hidden;
            overflow-y: auto;
            height: 100%;
          }

          @keyframes modalFade {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }

          @keyframes joinPanelIn {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          @keyframes joinGlow {
            0% { box-shadow: 0 20px 48px rgba(18, 24, 58, 0.28); }
            50% { box-shadow: 0 24px 58px rgba(18, 24, 58, 0.38); }
            100% { box-shadow: 0 20px 48px rgba(18, 24, 58, 0.28); }
          }

          .join-panel {
            animation: joinPanelIn 0.7s ease, joinGlow 5s ease-in-out infinite;
            box-sizing: border-box;
          }

          .join-title {
            font-size: 28px;
          }

          .join-subtitle {
            font-size: 14px;
          }

          .join-gender-row {
            display: flex;
            gap: 12px;
            margin-bottom: 10px;
            margin-top: 5px;
            justify-content: center;
          }

          .join-gender-button {
            flex: 1;
          }

          .join-input {
            display: block;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.18);
            outline: none;
            background: rgba(255,255,255,0.88);
            color: #14213d;
            font-size: 16px;
            font-weight: 600;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 24px rgba(15,23,42,0.14);
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          }

          .join-input:focus {
            border-color: rgba(250,204,21,0.92);
            box-shadow: 0 0 0 3px rgba(250,204,21,0.22), 0 16px 28px rgba(15,23,42,0.18);
            transform: translateY(-1px);
          }

          .join-input::placeholder {
            color: #64748b;
            font-weight: 500;
          }

          .join-upload {
            display: block;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            padding: 12px;
            border-radius: 16px;
            border: 1px dashed rgba(255,255,255,0.34);
            background: rgba(9, 14, 30, 0.24);
            color: white;
            backdrop-filter: blur(8px);
            overflow: hidden;
          }

          .join-upload::-webkit-file-upload-button {
            margin-right: 12px;
            padding: 10px 14px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, #facc15, #fb7185);
            color: #111827;
            font-weight: 800;
            cursor: pointer;
          }

          @media (max-width: 768px) {
            html, body {
              overflow-y: auto !important;
            }

            .join-shell {
              padding: 16px !important;
              align-items: flex-start !important;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch;
            }

            .join-exit-button {
              top: 12px !important;
              right: 12px !important;
              width: auto !important;
              padding: 8px 14px !important;
              font-size: 13px !important;
            }

            .join-panel {
              max-width: 420px !important;
              border-radius: 22px !important;
              padding: 22px 16px !important;
              margin-top: 54px;
              margin-bottom: 18px;
            }

            .join-title {
              font-size: 24px !important;
            }

            .join-subtitle {
              font-size: 13px !important;
              margin-bottom: 16px !important;
            }

            .join-gender-button {
              min-width: 0;
              padding: 12px 12px !important;
              font-size: 15px !important;
            }

            .join-input {
              padding: 12px 14px;
              border-radius: 14px;
              font-size: 15px;
            }

            .join-upload {
              padding: 10px;
              font-size: 13px;
            }
          }

          @media (max-width: 430px) {
            .join-shell {
              padding: 14px !important;
            }

            .join-panel {
              max-width: 100% !important;
              padding: 20px 14px !important;
              margin-bottom: 24px;
            }

            .join-title {
              font-size: 22px !important;
            }

            .join-gender-row {
              gap: 8px;
            }

            .join-gender-button {
              padding: 12px 10px !important;
              font-size: 14px !important;
            }

            .join-upload::-webkit-file-upload-button {
              display: block;
              width: 100%;
              margin: 0 0 8px 0;
              padding: 10px 12px;
            }
          }
        `}
      </style>

      {/* Botón salir arriba derecha */}
      <button
        className="join-exit-button"
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
        className="join-panel"
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "linear-gradient(180deg, rgba(10,18,38,0.86), rgba(20,31,58,0.78))",
          borderRadius: "28px",
          padding: "28px 24px",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 20px 48px rgba(3,7,18,0.34)",
          backdropFilter: "blur(18px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            right: "-10%",
            width: "180px",
            height: "180px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(244,114,182,0.35), transparent 68%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-18%",
            left: "-8%",
            width: "170px",
            height: "170px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
        <h1
          className="join-title"
          style={{
            color: "#f8fafc",
            textShadow: "0 0 18px rgba(96,165,250,0.24)",
            fontSize: "28px",
            lineHeight: 1.1,
            marginBottom: "8px",
            letterSpacing: "0.01em",
          }}
        >
          Unirse a la Gala Best Rewards
        </h1>

        <p
          className="join-subtitle"
          style={{
            margin: "0 0 18px",
            color: "#cbd5e1",
            fontSize: "14px",
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          Completa tus datos, elige tu perfil y sube las dos fotos para entrar con una imagen mucho más cuidada a la gala.
        </p>

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.28)",
              padding: "12px 14px",
              borderRadius: "14px",
              border: "1px solid rgba(254,202,202,0.35)",
              color: "white",
              fontWeight: "bold",
              marginBottom: "12px",
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
              background: "rgba(0,0,0,0.44)",
              padding: "12px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.14)",
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
            gap: "14px",
            marginTop: "10px",
          }}
        >
          {/* Nombre */}
          <div style={{ textAlign: "left", color: "#e2e8f0", fontSize: "13px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            🧑 Nombre
          </div>
          <input
            type="text"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="join-input"
          />

          {/* Apellidos */}
          <div style={{ textAlign: "left", color: "#e2e8f0", fontSize: "13px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            👤 Apellidos
          </div>
          <input
            type="text"
            placeholder="Apellidos"
            value={lastname}
            onChange={(e) => setLastname(e.target.value)}
            className="join-input"
          />

          {/* Selector de género */}
          <div style={{ textAlign: "left", color: "#e2e8f0", fontSize: "13px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
              className="join-gender-button"
              onClick={() => setGender("male")}
              style={{
                flex: 1,
                padding: "14px 16px",
                borderRadius: "16px",
                border:
                  gender === "male"
                    ? "2px solid rgba(56,189,248,0.95)"
                    : "2px solid rgba(255,255,255,0.3)",
                background:
                  gender === "male"
                    ? "linear-gradient(135deg, rgba(56,189,248,0.34), rgba(37,99,235,0.22))"
                    : "rgba(255,255,255,0.14)",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                backdropFilter: "blur(6px)",
                boxShadow: gender === "male" ? "0 14px 26px rgba(56,189,248,0.22)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              ♂️ Chico
            </button>

            <button
              className="join-gender-button"
              onClick={() => setGender("female")}
              style={{
                flex: 1,
                padding: "14px 16px",
                borderRadius: "16px",
                border:
                  gender === "female"
                    ? "2px solid rgba(244,114,182,0.95)"
                    : "2px solid rgba(255,255,255,0.3)",
                background:
                  gender === "female"
                    ? "linear-gradient(135deg, rgba(244,114,182,0.34), rgba(190,24,93,0.22))"
                    : "rgba(255,255,255,0.14)",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                backdropFilter: "blur(6px)",
                boxShadow: gender === "female" ? "0 14px 26px rgba(244,114,182,0.22)" : "none",
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
              color: "#e2e8f0",
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
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
            className="join-upload"
          />
          <div style={{ marginTop: "-8px", textAlign: "left", color: "#cbd5e1", fontSize: "12px", fontWeight: 600 }}>
            {profileFile ? `Seleccionada: ${profileFile.name}` : "Elige una foto clara y centrada para tu perfil."}
          </div>

          {/* Foto para ganador */}
          <div style={{ textAlign: "left", color: "#e2e8f0", fontSize: "13px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            🏆 Foto para Ganador
          </div>
          <input
            type="file"
            accept="image/*,.heic,.heif,.jpeg,.jpg,.png,.webp,.bmp,.tiff,.avif"
            onChange={(e) => setWinnerFile(e.target.files[0])}
            className="join-upload"
          />
          <div style={{ marginTop: "-8px", textAlign: "left", color: "#cbd5e1", fontSize: "12px", fontWeight: 600 }}>
            {winnerFile ? `Seleccionada: ${winnerFile.name}` : "Esta foto se usará si sales ganador o ganadora."}
          </div>

          {/* Botón entrar */}
          <button
            onClick={joinGala}
            disabled={isLoading}
            style={{
              padding: "16px",
              fontSize: "18px",
              fontWeight: 900,
              letterSpacing: "0.03em",
              background: isLoading ? "rgba(250,204,21,0.45)" : "linear-gradient(135deg, #facc15, #fb7185)",
              border: "none",
              borderRadius: "18px",
              cursor: isLoading ? "default" : "pointer",
              boxShadow: isLoading ? "none" : "0 18px 32px rgba(251,113,133,0.34)",
              marginTop: "12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "10px",
              color: "#111827",
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
            }}
          >
            {isLoading ? "Subiendo..." : "🚀 Entrar"}
          </button>
        </div>
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
