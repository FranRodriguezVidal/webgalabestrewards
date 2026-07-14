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

  const navigate = useNavigate();

  const uploadLocal = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://localhost:3001/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    return data.fileName;
  };

  const joinGala = async () => {
    setError("");

    if (!name || !lastname || !profileFile || !winnerFile) {
      setError("Por favor completa todos los campos.");
      return;
    }

    await auth.signOut();

    const userCredential = await signInAnonymously(auth);
    const user = userCredential.user;

    const profilePhotoName = await uploadLocal(profileFile);
    const winnerPhotoName = await uploadLocal(winnerFile);

    await setDoc(doc(db, "users", user.uid), {
      name,
      lastname,
      profilePhoto: profilePhotoName,
      winnerPhoto: winnerPhotoName,
      role: "voter",
      connected: true,
      votes: 0,
    });

    sessionStorage.setItem("voterId", user.uid);
    navigate("/voter");
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

          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            Foto de Perfil
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setProfileFile(e.target.files[0])}
            style={{ width: "100%" }}
          />

          <div style={{ textAlign: "left", color: "white", fontSize: "14px" }}>
            Foto para Ganador
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setWinnerFile(e.target.files[0])}
            style={{ width: "100%" }}
          />

          <button
            onClick={joinGala}
            style={{
              padding: "14px",
              fontSize: "18px",
              background: "gold",
              border: "none",
              borderRadius: "14px",
              cursor: "pointer",
              boxShadow: "0 0 20px gold",
              marginTop: "10px",
            }}
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}
