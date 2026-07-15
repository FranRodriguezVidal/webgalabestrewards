import { useState } from "react";
import { auth, db } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function Join() {
  const [name, setName] = useState("");
  const [lastname, setLastname] = useState("");
  const [profileFile, setProfileFile] = useState(null);
  const [winnerFile, setWinnerFile] = useState(null);
  const [error, setError] = useState("");
  const [gender, setGender] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // MODAL INFO FOTO PERFIL
  const [showInfoProfile, setShowInfoProfile] = useState(false);

  const navigate = useNavigate();

  const compressImageForUpload = async (file) => {
    if (!file || typeof file.name !== "string") {
      throw new Error("El archivo seleccionado no es válido.");
    }

    if (!file.type.startsWith("image/")) {
      return file;
    }

    if (file.size < 1500000 && file.type !== "image/heic") {
      return file;
    }

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
      return file;
    }

    const newName = file.name.replace(/\.[^/.]+$/, ".jpg");
    return new File([blob], newName, { type: "image/jpeg" });
  };

  const uploadLocal = async (file) => {
    if (!file || typeof file.name !== "string") {
      throw new Error("El archivo seleccionado no es válido.");
    }

    const uploadFile = await compressImageForUpload(file);

    console.log("subiendo archivo", {
      name: uploadFile.name,
      type: uploadFile.type,
      size: uploadFile.size,
    });

    const formData = new FormData();
    formData.append("file", uploadFile, uploadFile.name);

    const response = await fetch("https://gala-backend.franrvguijo.workers.dev/upload", {
      method: "POST",
      mode: "cors",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("uploadLocal error response", response.status, text);
      throw new Error(`Error al subir imagen: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (!data?.fileName) {
      console.error("uploadLocal invalid data", data);
      throw new Error("Respuesta inválida del servidor de imágenes.");
    }

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
        connected: true,
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
          background: "rgba(255,255,255,0.12)",
          borderRadius: "20px",
          padding: "25px 20px",
          boxShadow: "0 0 25px rgba(0,0,0,0.3)",
          backdropFilter: "blur(12px)",
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
            }}
          >
            {error}
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
                    ? "2px solid gold"
                    : "2px solid rgba(255,255,255,0.3)",
                background:
                  gender === "male"
                    ? "rgba(255,215,0,0.25)"
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
                    ? "2px solid gold"
                    : "2px solid rgba(255,255,255,0.3)",
                background:
                  gender === "female"
                    ? "rgba(255,215,0,0.25)"
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
            accept="image/*"
            onChange={(e) => setProfileFile(e.target.files[0])}
            style={{ width: "100%" }}
          />

          {/* Foto para ganador */}
          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            🏆 Foto para Ganador
          </div>
          <input
            type="file"
            accept="image/*"
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
