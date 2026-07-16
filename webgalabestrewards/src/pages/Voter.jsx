import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { findDuplicateQuestion, getQuestionsForGender } from "../questions";


export default function Voter() {
  const [userId, setUserId] = useState(null);
  const [galaState, setGalaState] = useState(null);
  const [nominees, setNominees] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [hasVotedChico, setHasVotedChico] = useState(false);
  const [hasVotedChica, setHasVotedChica] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [questionError, setQuestionError] = useState("");
  const navigate = useNavigate();
  const questionTextInState = galaState?.currentQuestion?.text || "";
  const questionGender = galaState?.currentGenderRound || "";
  const isQuestionExpired = galaState?.questionExpiresAt && Date.now() > galaState.questionExpiresAt;

  // Detectar usuario actual
  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
    });
  }, []);

  // Actualizar presencia del votante según visibilidad de la pestaña
  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, "users", userId);

    const setConnected = async (connected) => {
      try {
        await updateDoc(userRef, {
          connected,
          lastSeen: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Error actualizando estado de conexión:", error);
      }
    };

    const handleVisibilityChange = () => {
      setConnected(!document.hidden);
    };

    const handleWindowBlur = () => {
      if (document.hidden) {
        setConnected(false);
      }
    };

    const handleWindowFocus = () => {
      setConnected(true);
    };

    const heartbeatInterval = setInterval(() => {
      if (!document.hidden) {
        setConnected(true);
      }
    }, 8000);

    setConnected(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      setConnected(false);
    };
  }, [userId]);

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

  // Comprobar si el usuario ya votó en la ronda actual
  useEffect(() => {
    if (!userId || !galaState || !galaState.currentCategory) return;

    const checkVote = async () => {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const votedRounds = data.votedRounds || {};
        const categoryRounds = votedRounds[galaState.currentCategory] || {};
        setHasVotedChico(!!categoryRounds.chico);
        setHasVotedChica(!!categoryRounds.chica);
        setHasVoted(!!categoryRounds.chico && !!categoryRounds.chica);
      }
    };

    checkVote();
  }, [userId, galaState]);

  // Seleccionar pregunta del banco automático si no se ha definido ninguna
  useEffect(() => {
    if (!galaState || galaState.stage !== "question" || galaState.currentQuestion) return;
    if (!galaState.currentGenderRound) return;

    const questionsForGender = getQuestionsForGender(galaState.currentGenderRound);
    if (!questionsForGender.length) return;

    const chosenQuestion = questionsForGender[Math.floor(Math.random() * questionsForGender.length)];

    const publishQuestion = async () => {
      try {
        await updateDoc(doc(db, "galaState", "state"), {
          currentQuestion: {
            text: chosenQuestion.text,
            gender: chosenQuestion.gender,
            createdBy: "system",
            createdAt: Date.now(),
            expiresAt: Date.now() + 150000,
          },
          stage: "waiting",
          questionStatus: "waiting",
          questionExpiresAt: Date.now() + 150000,
          votingExpiresAt: null,
          lastActionAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Error creando pregunta automática:", error);
      }
    };

    publishQuestion();
  }, [galaState]);

  // Abrir votación automáticamente cuando la pregunta expire
  useEffect(() => {
    if (!galaState || galaState.stage !== "waiting" || !galaState.currentQuestion || !galaState.questionExpiresAt) return;

    const interval = setInterval(async () => {
      if (Date.now() <= galaState.questionExpiresAt) return;
      clearInterval(interval);

      try {
        await updateDoc(doc(db, "galaState", "state"), {
          stage: "voting",
          questionStatus: "voting",
          votingExpiresAt: Date.now() + 150000,
          lastActionAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Error abriendo votación automática:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [galaState]);

  // Avanzar automáticamente de chico a chica después de resultados
  useEffect(() => {
    if (!galaState || galaState.stage !== "results" || galaState.currentGenderRound !== "chico") return;
    const completedRounds = galaState.roundsCompleted || [];
    if (completedRounds.includes("chico")) return;

    const timeout = setTimeout(async () => {
      try {
        await updateDoc(doc(db, "galaState", "state"), {
          stage: "question",
          currentGenderRound: "chica",
          questionStatus: "creating",
          currentQuestion: null,
          questionExpiresAt: Date.now() + 150000,
          votingExpiresAt: null,
          roundsCompleted: [...completedRounds, "chico"],
          resultsByGender: {
            ...(galaState.resultsByGender || {}),
            chico: {
              winnerId: galaState.autoWinnerId || null,
              leastVotedNomineeId: galaState.leastVotedNomineeId || null,
              question: galaState.currentQuestion?.text || "",
            },
          },
          lastActionAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Error avanzando a ronda chica automáticamente:", error);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [galaState]);

  // Cerrar automáticamente la votación cuando expire el temporizador
  useEffect(() => {
    if (!galaState || galaState.stage !== "voting" || !galaState.votingExpiresAt) return;

    const interval = setInterval(async () => {
      if (Date.now() <= galaState.votingExpiresAt) return;
      clearInterval(interval);

      if (!galaState.currentCategory) return;

      const nomineesQuery = query(
        collection(db, "nominees"),
        where("categoryId", "==", galaState.currentCategory)
      );

      const snapshot = await getDocs(nomineesQuery);
      const nomineesList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const voteEntries = nomineesList.map((nominee) => ({
        id: nominee.id,
        votes: nominee.votes || 0,
      }));

      const hasVote = voteEntries.some((entry) => entry.votes > 0);
      const sortedByVotes = [...voteEntries].sort((a, b) => b.votes - a.votes);
      const sortedByLeast = [...voteEntries].sort((a, b) => a.votes - b.votes);
      const winnerId = sortedByVotes[0]?.id || null;
      const leastVotedId = sortedByLeast[0]?.id || null;

      await updateDoc(doc(db, "galaState", "state"), {
        stage: "results",
        resultsClosedAt: Date.now(),
        autoDecidedByNoVotes: !hasVote,
        autoWinnerId: !hasVote ? winnerId : null,
        leastVotedNomineeId: leastVotedId,
        showPresenter: false,
        lastActionAt: serverTimestamp(),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [galaState]);

  // Guardar pantalla actual para que el admin la vea
  useEffect(() => {
    if (!userId || !galaState) return;

    const getScreenLabel = () => {
      if (galaState.stage === "question") {
        return questionText ? "Creando pregunta" : "Ronda de pregunta";
      }
      if (galaState.stage === "waiting") {
        return questionTextInState ? "Esperando votación" : "Sin pregunta";
      }
      if (galaState.stage === "voting") {
        return hasVoted ? "Esperando resultados" : "Votando";
      }
      if (galaState.stage === "paused") {
        return "Votación pausada";
      }
      if (galaState.stage === "results") {
        return "Resultados";
      }
      return "En la gala";
    };

    const screenLabel = getScreenLabel();
    const userRef = doc(db, "users", userId);

    updateDoc(userRef, {
      currentScreen: screenLabel,
      lastSeen: serverTimestamp(),
    }).catch((error) => {
      console.warn("Error actualizando pantalla actual del usuario:", error);
    });
  }, [userId, galaState, questionText, questionTextInState, hasVoted]);

  // Función para votar
  const vote = async (nomineeId) => {
    if (!userId || hasVoted || galaState.stage !== "voting") return;
    if (!galaState.currentCategory || !galaState.currentGenderRound) return;

    const nominee = nominees.find((n) => n.id === nomineeId);
    if (!nominee) return;

    await updateDoc(doc(db, "nominees", nomineeId), {
      votes: increment(1),
    });

    await updateDoc(doc(db, "users", userId), {
      votes: increment(1),
      [`votedRounds.${galaState.currentCategory}.${galaState.currentGenderRound}`]: true,
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
  const creatingQuestion = galaState.stage === "question";
  const waitingForVoting = galaState.stage === "waiting";
  const showingQuestion = ["question", "waiting", "voting"].includes(galaState.stage);
  const showWaitingForAdmin = alreadyJoined && !showingQuestion && galaState.stage !== "voting";

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
              fgColor="#000000"
              imageSettings={{
                src: "/qr_black_yellow.png",
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
      {showWaitingForAdmin && (
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
      {alreadyJoined && creatingQuestion && (
        <div style={{ marginTop: "40px" }}>
          <h2 style={{ marginBottom: "12px" }}>
            Fase de pregunta ({questionGender})
          </h2>
          {questionTextInState ? (
            <div style={{ color: "white", fontSize: "18px" }}>
              <p>Pregunta creada:</p>
              <p style={{ fontWeight: "bold", marginTop: "6px" }}>{questionTextInState}</p>
              <p style={{ marginTop: "12px", color: "gold" }}>Esperando para la votación...</p>
            </div>
          ) : (
            <div>
              <p style={{ color: "white", marginBottom: "10px" }}>
                Escribe una pregunta para esta ronda (3 minutos).
              </p>
              {questionError && (
                <div style={{ color: "#ff9c9c", marginBottom: "10px" }}>{questionError}</div>
              )}
              <textarea
                value={questionText}
                onChange={(event) => setQuestionText(event.target.value)}
                rows={4}
                style={{ width: "100%", borderRadius: "12px", padding: "12px" }}
              />
              <button
                onClick={async () => {
                  const trimmed = questionText.trim();
                  if (!trimmed) {
                    setQuestionError("Escribe una pregunta antes de enviar.");
                    return;
                  }
                  const duplicate = findDuplicateQuestion(trimmed);
                  if (duplicate) {
                    setQuestionError("Esa pregunta ya existe: " + duplicate.text);
                    return;
                  }
                  try {
                    await updateDoc(doc(db, "galaState", "state"), {
                      currentQuestion: {
                        text: trimmed,
                        gender: questionGender,
                        createdBy: userId,
                        createdAt: Date.now(),
                        expiresAt: Date.now() + 180000,
                      },
                      stage: "waiting",
                      questionStatus: "waiting",
                      lastActionAt: serverTimestamp(),
                    });
                  } catch (err) {
                    setQuestionError("Error guardando la pregunta. Intenta de nuevo.");
                  }
                }}
                style={{
                  marginTop: "10px",
                  padding: "10px 18px",
                  background: "gold",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                }}
              >
                Crear pregunta
              </button>
            </div>
          )}
        </div>
      )}

      {alreadyJoined && galaState.stage === "waiting" && (
        <div style={{ marginTop: "40px" }}>
          <h2>Esperando votación</h2>
          {questionTextInState ? (
            <>
              <p>Pregunta seleccionada:</p>
              <p style={{ fontWeight: "bold" }}>{questionTextInState}</p>
            </>
          ) : (
            <p>No se creó una pregunta en el tiempo asignado.</p>
          )}
          <p style={{ marginTop: "12px" }}>En cuanto el admin abra la votación, podrás votar.</p>
        </div>
      )}

      {alreadyJoined && galaState.stage === "voting" && !hasVoted && (
        <div style={{ marginTop: "40px" }}>
          <h2>Categoría: {galaState.currentCategory} ({galaState.currentGenderRound})</h2>
          {questionTextInState && (
            <div style={{ marginBottom: "20px", color: "white" }}>
              <p>Pregunta actual:</p>
              <p style={{ fontWeight: "bold" }}>{questionTextInState}</p>
            </div>
          )}

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
