import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  deleteDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";


export default function Voter() {
  const [userId, setUserId] = useState(null);
  const [galaState, setGalaState] = useState(null);
  const [nominees, setNominees] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const navigate = useNavigate();


  // Detectar usuario actual
  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
    });
  }, []);

  // Cargar estado global de la gala
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "galaState", "state"), (snapshot) => {
      setGalaState(snapshot.data());
    });

    return () => unsubscribe();
  }, []);

  // Cargar nominados de la categoría activa
  useEffect(() => {
    if (!galaState || galaState.currentCategory === "none") return;

    const unsubscribe = onSnapshot(collection(db, "nominees"), (snapshot) => {
      const list = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((nominee) => nominee.categoryId === galaState.currentCategory);

      setNominees(list);
    });

    return () => unsubscribe();
  }, [galaState]);

  // Comprobar si el usuario ya votó
  useEffect(() => {
    if (!userId || !galaState) return;

    const checkVote = async () => {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        setHasVoted(userDoc.data().votes > 0);
      }
    };

    checkVote();
  }, [userId, galaState]);

  // Función para votar
  const vote = async (nomineeId) => {
    if (!userId || hasVoted || galaState.stage !== "voting") return;

    const nominee = nominees.find((n) => n.id === nomineeId);

    await updateDoc(doc(db, "nominees", nomineeId), {
      votes: nominee.votes + 1
    });

    await updateDoc(doc(db, "users", userId), {
      votes: 1
    });

    setHasVoted(true);
    alert("¡Voto registrado!");
  };

  // SALIR DEL VOTANTE
  const exitVoter = async () => {
    const confirmExit = window.confirm("¿Seguro que quieres salir?");
    if (!confirmExit) return;

    // Borrar usuario de Firestore
    if (userId) {
      await deleteDoc(doc(db, "users", userId));
    }

    // Cerrar sesión
    await auth.signOut();

    // Limpiar sessionStorage
    sessionStorage.removeItem("voterId");

    // Recargar pantalla
    window.location.href = "/";
  };

  if (!galaState) return <p>Cargando...</p>;

  const alreadyJoined = sessionStorage.getItem("voterId");

  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #3f1dcb, #1a73e8, #ffffff, #ff66cc)",
        position: "relative"
      }}
    >
      <style>
        {`
  @keyframes qrGlow {
    0% { filter: drop-shadow(0 0 5px rgba(255,255,255,0.4)); }
    50% { filter: drop-shadow(0 0 15px rgba(255,255,255,0.9)); }
    100% { filter: drop-shadow(0 0 5px rgba(255,255,255,0.4)); }
  }
`}
      </style>
      <style>
        {`
  @keyframes breatheBtn {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }

  @keyframes fadePop {
    0% { opacity: 0; transform: scale(0.7); }
    100% { opacity: 1; transform: scale(1); }
  }
`}
      </style>
            <style>
        {`
    html, body {
      overflow: hidden;
      height: 100%;
    }
  `}
      </style>


      {/* BOTÓN SALIR */}
      {alreadyJoined && (
        <button
          onClick={exitVoter}
          style={{
            position: "absolute",
            top: "15px",
            right: "15px",
            padding: "10px 20px",
            background: "rgba(0,0,0,0.4)",
            border: "none",
            borderRadius: "999px",
            color: "white",
            cursor: "pointer",
            backdropFilter: "blur(6px)"
          }}
        >
          Salir
        </button>
      )}

      {/* QR SOLO SI NO ESTÁ REGISTRADO */}
      {!alreadyJoined && (
        <div
          style={{
            marginTop: "40px",
            textAlign: "center",
            animation: "fadeIn 1s ease",
            width: "100%",
          }}
        >
          <h2
            style={{
              color: "white",
              textShadow: "0 0 10px white",
              marginBottom: "10px",
            }}
          >
            ¡Únete como votante y disfruta de la gala!
          </h2>

          {/* CONTENEDOR DEL QR */}
          <div
            style={{
              marginTop: "20px",
              padding: "20px",
              borderRadius: "20px",
              animation: "qrGlow 3s infinite ease-in-out",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <QRCodeCanvas
              value="https://webgalabestrewards.pages.dev/join"
              size={420}
              bgColor="transparent"
              fgColor="#e310eb"
              imageSettings={{
                src: "/qr.png",
                height: 150,
                width: 150,
                excavate: true,
              }}
            />
          </div>

          {/* BOTÓN DEBAJO DEL QR */}
          <button
            onClick={() => navigate("/spectator")}
            style={{
              marginTop: "30px",
              padding: "14px 32px",
              background: "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.4)",
              borderRadius: "999px",
              color: "white",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              fontSize: "20px",
              fontWeight: "bold",
              letterSpacing: "1px",
              boxShadow: "0 0 15px rgba(255,255,255,0.6)",
              animation: "breatheBtn 3s infinite ease-in-out, fadePop 0.6s ease",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "scale(1.12)";
              e.target.style.background = "rgba(255,215,0,0.35)";
              e.target.style.boxShadow = "0 0 30px gold";
              e.target.style.border = "2px solid gold";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "scale(1)";
              e.target.style.background = "rgba(255,255,255,0.15)";
              e.target.style.boxShadow = "0 0 15px rgba(255,255,255,0.6)";
              e.target.style.border = "2px solid rgba(255,255,255,0.4)";
            }}
          >
            Ir a espectador
          </button>
        </div>
      )}




      {/* ESPERANDO AL ADMIN */}
      {alreadyJoined && galaState.stage !== "voting" && (
        <div style={{ marginTop: "80px" }}>
          <h2 style={{ color: "white", marginBottom: "20px" }}>
            Esperando a que el administrador abra las votaciones…
          </h2>

          {/* ANIMACIONES */}
          <div className="loaderContainer">
            <div className="loaderDots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <style>
            {`
              .loaderCircle {
                width: 70px;
                height: 70px;
                border-radius: 50%;
                border: 6px solid rgba(255,255,255,0.3);
                border-top-color: gold;
                animation: spin 1s linear infinite;
                margin: 0 auto 25px auto;
              }

              .loaderBar {
                width: 150px;
                height: 10px;
                border-radius: 999px;
                background: rgba(255,255,255,0.2);
                overflow: hidden;
                position: relative;
                margin: 0 auto 25px auto;
              }

              .loaderBar::before {
                content: "";
                position: absolute;
                left: -40%;
                width: 40%;
                height: 100%;
                background: gold;
                animation: slide 1.2s infinite;
              }

              .loaderDots {
                display: flex;
                justify-content: center;
                gap: 10px;
              }

              .loaderDots span {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: gold;
                animation: bounce 0.8s infinite alternate;
              }

              .loaderDots span:nth-child(2) {
                animation-delay: 0.2s;
              }
              .loaderDots span:nth-child(3) {
                animation-delay: 0.4s;
              }

              @keyframes spin {
                to { transform: rotate(360deg); }
              }

              @keyframes slide {
                0% { left: -40%; }
                100% { left: 100%; }
              }

              @keyframes bounce {
                from { transform: translateY(0); opacity: 0.5; }
                to { transform: translateY(-10px); opacity: 1; }
              }
            `}
          </style>
        </div>
      )}

      {/* VOTACIÓN */}
      {alreadyJoined && galaState.stage === "voting" && !hasVoted && (
        <div style={{ marginTop: "40px" }}>
          <h2>Categoría: {galaState.currentCategory}</h2>

          {nominees.map((nominee) => (
            <div key={nominee.id} style={{ marginBottom: "20px" }}>
              <img
                src={`http://localhost:3001/uploads/${nominee.photo}`}
                alt={nominee.name}
                width="100"
                style={{ borderRadius: "10px" }}
              />
              <p>{nominee.name}</p>
              <button
                onClick={() => vote(nominee.id)}
                style={{
                  padding: "10px 20px",
                  background: "gold",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer"
                }}
              >
                Votar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* YA VOTÓ */}
      {alreadyJoined && hasVoted && (
        <h2 style={{ marginTop: "60px", color: "white" }}>
          Ya has votado esta categoría.
        </h2>
      )}
    </div>
  );
}
