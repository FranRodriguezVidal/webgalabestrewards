import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { db, auth } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
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
import { getQuestionsForGender } from "../questions";


export default function Voter() {
  const TOTAL_QUESTIONS = 5;
  const [userId, setUserId] = useState(null);
  const [galaState, setGalaState] = useState(null);
  const [connectedCandidates, setConnectedCandidates] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [hasVotedChico, setHasVotedChico] = useState(false);
  const [hasVotedChica, setHasVotedChica] = useState(false);
  const navigate = useNavigate();
  const questionChicoText = galaState?.currentQuestionChico?.text || "";
  const questionChicaText = galaState?.currentQuestionChica?.text || "";
  const questionDisplayText = questionChicoText || questionChicaText;
  const currentQuestionNumber = galaState?.currentQuestionNumber || 1;
  const questionVoteKey = `q${currentQuestionNumber}`;

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

  // Cargar todos los usuarios para votar (sin incluir al usuario actual)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((user) => user.id !== userId)
          .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" }));

        setConnectedCandidates(list);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Comprobar si el usuario ya votó en la ronda actual
  useEffect(() => {
    if (!userId || !galaState || !galaState.currentCategory) return;

    const checkVote = async () => {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const votedRounds = data.votedRounds || {};
        const categoryRounds = votedRounds[galaState.currentCategory] || {};
        const questionVotes = categoryRounds[questionVoteKey] || {};
        setHasVotedChico(!!questionVotes.chico);
        setHasVotedChica(!!questionVotes.chica);
        setHasVoted(!!questionVotes.chico && !!questionVotes.chica);
      }
    };

    checkVote();
  }, [userId, galaState, questionVoteKey]);

  // Si falta un género en candidatos, marcar ese voto como completado automáticamente
  useEffect(() => {
    if (!userId || !galaState || galaState.stage !== "voting" || !galaState.currentCategory) return;
    if (!connectedCandidates.length) return;

    const hasChicoCandidates = connectedCandidates.some((candidate) => {
      const gender = (candidate.gender || "").toLowerCase();
      return gender === "male" || gender === "chico";
    });
    const hasChicaCandidates = connectedCandidates.some((candidate) => {
      const gender = (candidate.gender || "").toLowerCase();
      return gender === "female" || gender === "chica";
    });

    const applyAutoPass = async () => {
      const updates = {};

      if (!hasChicoCandidates && !hasVotedChico) {
        updates[`votedRounds.${galaState.currentCategory}.${questionVoteKey}.chico`] = true;
        setHasVotedChico(true);
      }

      if (!hasChicaCandidates && !hasVotedChica) {
        updates[`votedRounds.${galaState.currentCategory}.${questionVoteKey}.chica`] = true;
        setHasVotedChica(true);
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "users", userId), updates);
      }

      const finalChico = hasVotedChico || !hasChicoCandidates;
      const finalChica = hasVotedChica || !hasChicaCandidates;
      setHasVoted(finalChico && finalChica);
    };

    applyAutoPass().catch((error) => {
      console.warn("Error aplicando auto-pase por género faltante:", error);
    });
  }, [userId, galaState, connectedCandidates, hasVotedChico, hasVotedChica, questionVoteKey]);

  // Crear automáticamente preguntas chico/chica cuando inicia la ronda
  useEffect(() => {
    if (!galaState || galaState.stage !== "question") return;
    if (galaState.currentQuestionChico && galaState.currentQuestionChica) return;

    const questions = getQuestionsForGender("all");
    if (!questions.length) return;

    const chosenQuestion = questions[Math.floor(Math.random() * questions.length)];

    const publishQuestion = async () => {
      try {
        await updateDoc(doc(db, "galaState", "state"), {
          currentQuestionChico: {
            text: chosenQuestion.text,
            gender: "chico",
            createdBy: "system",
            createdAt: Date.now(),
            expiresAt: Date.now() + 10000,
          },
          currentQuestionChica: {
            text: chosenQuestion.text,
            gender: "chica",
            createdBy: "system",
            createdAt: Date.now(),
            expiresAt: Date.now() + 10000,
          },
          stage: "waiting",
          questionStatus: "waiting",
          questionExpiresAt: Date.now() + 10000,
          votingExpiresAt: null,
          lastActionAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Error creando pregunta automática:", error);
      }
    };

    publishQuestion();
  }, [galaState, currentQuestionNumber, questionVoteKey]);

  // Abrir votación automáticamente cuando termina la pantalla de pregunta
  useEffect(() => {
    if (!galaState || galaState.stage !== "waiting" || !galaState.questionExpiresAt) return;

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
  }, [galaState, currentQuestionNumber, questionVoteKey]);

  // Cerrar votación automáticamente a los 2m30s o antes si todos votan ambos géneros
  useEffect(() => {
    if (!galaState || galaState.stage !== "voting" || !galaState.votingExpiresAt) return;

    const interval = setInterval(async () => {
      if (!galaState.currentCategory) return;

      const [nomineesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(query(collection(db, "nominees"), where("categoryId", "==", galaState.currentCategory))),
        getDocs(query(collection(db, "users"), where("connected", "==", true))),
      ]);

      const nomineesList = nomineesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const connectedUsers = usersSnapshot.docs.map((item) => item.data());

      const hasConnectedChico = connectedUsers.some((user) => {
        const gender = (user.gender || "").toLowerCase();
        return gender === "male" || gender === "chico";
      });
      const hasConnectedChica = connectedUsers.some((user) => {
        const gender = (user.gender || "").toLowerCase();
        return gender === "female" || gender === "chica";
      });

      const allConnectedVoted = connectedUsers.length > 0 && connectedUsers.every((user) => {
        const categoryVotes = user.votedRounds?.[galaState.currentCategory] || {};
        const questionVotes = categoryVotes[questionVoteKey] || {};
        const chicoDone = !hasConnectedChico || !!questionVotes.chico;
        const chicaDone = !hasConnectedChica || !!questionVotes.chica;
        return chicoDone && chicaDone;
      });

      if (Date.now() <= galaState.votingExpiresAt && !allConnectedVoted) return;
      clearInterval(interval);

      const chicoNominees = nomineesList.filter((nominee) => {
        const gender = (nominee.gender || "").toLowerCase();
        return gender === "chico" || gender === "male";
      });
      const chicaNominees = nomineesList.filter((nominee) => {
        const gender = (nominee.gender || "").toLowerCase();
        return gender === "chica" || gender === "female";
      });

      const topChico = [...chicoNominees].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0] || null;
      const topChica = [...chicaNominees].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0] || null;

      const rankingByVotes = nomineesList.reduce((acc, nominee) => {
        const votes = Number(nominee.votes || 0);
        if (!acc[votes]) acc[votes] = [];
        acc[votes].push({
          id: nominee.id,
          name: nominee.name || "Anónimo",
          lastname: nominee.lastname || "",
          gender: nominee.gender || "",
          votes,
          profilePhoto: nominee.profilePhoto || nominee.photo || "",
          photo: nominee.photo || nominee.profilePhoto || "",
        });
        return acc;
      }, {});

      const rankingGroups = Object.entries(rankingByVotes)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([votes, tiedNominees]) => ({
          votes: Number(votes),
          nominees: tiedNominees.sort((a, b) =>
            `${a.name || ""} ${a.lastname || ""}`.localeCompare(`${b.name || ""} ${b.lastname || ""}`, "es", {
              sensitivity: "base",
            })
          ),
        }));

      const winnersGroup = rankingGroups[0] || { nominees: [] };
      const lowestGroup = rankingGroups[rankingGroups.length - 1] || { nominees: [] };
      const presenterIds = lowestGroup.nominees.map((nominee) => nominee.id);

      const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;
      const isLastQuestion = currentQuestionNumber >= totalQuestions;

      const baseResults = {
        ...(galaState.resultsByGender || {}),
        [questionVoteKey]: {
          chico: {
            winnerId: topChico?.id || null,
            winnerName: topChico?.name || null,
            votes: topChico?.votes || 0,
          },
          chica: {
            winnerId: topChica?.id || null,
            winnerName: topChica?.name || null,
            votes: topChica?.votes || 0,
          },
          rankingGroups,
          winnerIds: winnersGroup.nominees.map((nominee) => nominee.id),
          presenterIds,
          categoryId: galaState.currentCategory || null,
          closedAt: Date.now(),
        },
      };

      if (isLastQuestion) {
        await updateDoc(doc(db, "galaState", "state"), {
          stage: "results",
          resultsClosedAt: Date.now(),
          votingEndedByAllVotes: allConnectedVoted,
          showPresenter: false,
          revealModeActive: false,
          revealQuestionNumber: 1,
          resultsByGender: baseResults,
          lastActionAt: serverTimestamp(),
        });
        return;
      }

      await Promise.all(
        nomineesList.map((nominee) =>
          updateDoc(doc(db, "nominees", nominee.id), {
            votes: 0,
            updatedAt: serverTimestamp(),
          }).catch(() => null)
        )
      );

      await updateDoc(doc(db, "galaState", "state"), {
        stage: "question",
        questionStatus: "creating",
        currentQuestionNumber: currentQuestionNumber + 1,
        currentQuestionChico: null,
        currentQuestionChica: null,
        questionExpiresAt: Date.now() + 10000,
        votingExpiresAt: null,
        votingEndedByAllVotes: allConnectedVoted,
        showPresenter: false,
        revealModeActive: false,
        revealQuestionNumber: currentQuestionNumber,
        resultsByGender: baseResults,
        lastActionAt: serverTimestamp(),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [galaState, currentQuestionNumber, questionVoteKey]);

  // Guardar pantalla actual para que el admin la vea
  useEffect(() => {
    if (!userId || !galaState) return;

    const getScreenLabel = () => {
      if (galaState.stage === "question") {
        return questionDisplayText ? "Pregunta lista" : "Ronda de pregunta";
      }
      if (galaState.stage === "waiting") {
        return "Preparando votación";
      }
      if (galaState.stage === "voting") {
        return hasVoted ? "Esperando resultados" : "Votando (chico/chica)";
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
  }, [userId, galaState, questionDisplayText, hasVoted]);

  // Función para votar
  const vote = async (candidate) => {
    if (!userId || hasVoted || galaState.stage !== "voting") return;
    if (!galaState.currentCategory) return;
    if (!candidate || !candidate.id) return;
    if (candidate.id === userId) return;

    const normalizedGender = (candidate.gender || "").toLowerCase();
    const nomineeGender = normalizedGender === "female" || normalizedGender === "chica" ? "chica" : (normalizedGender === "male" || normalizedGender === "chico" ? "chico" : null);
    if (!nomineeGender) {
      alert("Este nominado no tiene género configurado.");
      return;
    }

    if (nomineeGender === "chico" && hasVotedChico) {
      alert("Ya votaste en la ronda chico.");
      return;
    }
    if (nomineeGender === "chica" && hasVotedChica) {
      alert("Ya votaste en la ronda chica.");
      return;
    }

    await setDoc(
      doc(db, "nominees", candidate.id),
      {
        categoryId: galaState.currentCategory,
        userId: candidate.id,
        name: candidate.name || "Anónimo",
        lastname: candidate.lastname || "",
        gender: candidate.gender || "",
        profilePhoto: candidate.profilePhoto || candidate.photo || "",
        photo: candidate.profilePhoto || candidate.photo || "",
        votes: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, "users", userId), {
      votes: increment(1),
      [`votedRounds.${galaState.currentCategory}.${questionVoteKey}.${nomineeGender}`]: true,
    });

    if (nomineeGender === "chico") {
      setHasVotedChico(true);
      setHasVoted(hasVotedChica);
    } else {
      setHasVotedChica(true);
      setHasVoted(hasVotedChico);
    }

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
  const revealQuestionNumber = galaState?.revealQuestionNumber || 1;
  const revealQuestionKey = `q${revealQuestionNumber}`;
  const revealResult = galaState?.resultsByGender?.[revealQuestionKey] || null;
  const shouldPrepareStage = !!(userId && revealResult?.presenterIds?.includes(userId));
  const creatingQuestion = galaState.stage === "question";
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
            Esperando la siguiente ronda automática…
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
            VOTACIÓN NÚMERO 1
          </h2>
          {questionDisplayText ? (
            <div style={{ color: "white", fontSize: "18px" }}>
              <p>Pregunta:</p>
              <p style={{ fontWeight: "bold", marginTop: "6px" }}>{questionDisplayText}</p>
              <p style={{ marginTop: "12px", color: "gold" }}>La votación se abrirá automáticamente.</p>
            </div>
          ) : (
            <div>
              <p style={{ color: "white", marginBottom: "10px" }}>
                Generando preguntas automáticas...
              </p>
            </div>
          )}
        </div>
      )}

      {alreadyJoined && galaState.stage === "waiting" && (
        <div style={{ marginTop: "40px" }}>
          <h2>Esperando apertura automática</h2>
          {questionDisplayText ? (
            <>
              <p style={{ fontWeight: "bold" }}>{questionDisplayText}</p>
            </>
          ) : (
            <p>No se creó una pregunta en el tiempo asignado.</p>
          )}
          <p style={{ marginTop: "12px" }}>La votación se abrirá sola sin intervención del admin.</p>
        </div>
      )}

      {alreadyJoined && galaState.stage === "voting" && !hasVoted && (
        <div style={{ marginTop: "40px" }}>
          <h2>VOTACIÓN NÚMERO {currentQuestionNumber}</h2>
          {questionDisplayText && (
            <div style={{ marginBottom: "20px", color: "white" }}>
              <p style={{ fontWeight: "bold" }}>{questionDisplayText}</p>
              <p style={{ marginTop: "8px" }}>Debes emitir 2 votos: uno a un nominado chico y otro a una nominada chica.</p>
              <p style={{ marginTop: "8px", opacity: 0.85 }}>Si falta un género, ese voto se completa automáticamente.</p>
            </div>
          )}

          <h3 style={{ color: "white", marginBottom: "14px" }}>Todos los usuarios para votar</h3>

          {connectedCandidates.length === 0 && (
            <p style={{ color: "white", opacity: 0.9 }}>No hay usuarios disponibles para votar.</p>
          )}

          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "14px",
              alignItems: "stretch",
              paddingBottom: "8px",
            }}
          >
            {connectedCandidates.map((candidate) => {
              const gender = (candidate.gender || "").toLowerCase();
              const alreadyVotedThisGender = (gender === "female" || gender === "chica") ? hasVotedChica : hasVotedChico;
              const photoName = candidate.profilePhoto || candidate.photo;
              const photoSrc = photoName
                ? `https://gala-backend.franrvguijo.workers.dev/image/${photoName}`
                : "https://via.placeholder.com/100?text=No+img";
              const statusLabel = candidate.connected ? "Conectado" : "Desconectado";

              return (
                <div
                  key={candidate.id}
                  style={{
                    minWidth: "0",
                    background: "rgba(0,0,0,0.28)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: "16px",
                    padding: "12px",
                    textAlign: "center",
                    backdropFilter: "blur(8px)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <img
                    src={photoSrc}
                    alt={candidate.name || "Participante"}
                    width="90"
                    height="90"
                    style={{ borderRadius: "14px", objectFit: "cover" }}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "https://via.placeholder.com/100?text=No+img";
                    }}
                  />
                  <p style={{ margin: "8px 0 4px", color: "white", fontWeight: 700 }}>
                    {candidate.name || "Anónimo"}
                  </p>
                  <p style={{ margin: "0 0 10px", color: "#d1d5db", fontSize: "12px" }}>
                    {statusLabel}
                  </p>
                  <button
                    onClick={() => vote(candidate)}
                    disabled={alreadyVotedThisGender}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: alreadyVotedThisGender ? "#777" : "gold",
                      border: "none",
                      borderRadius: "10px",
                      cursor: alreadyVotedThisGender ? "not-allowed" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Votar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* YA VOTÓ */}
      {alreadyJoined && galaState.stage === "results" && (
        <div style={{ marginTop: "60px", color: "white", lineHeight: 1.4 }}>
          <h2>
            ENHORABUENA SE HA FINALIZADO LA VOTACION, MIRA A LA PANTALLA DE ESPECTADOR
          </h2>
          <p style={{ marginTop: "12px", fontWeight: 700 }}>
            Categoria: {galaState.currentCategory || "Sin categoria"}
          </p>
          <p style={{ marginTop: "6px", fontWeight: 700 }}>
            Pregunta en show: {revealQuestionNumber}
          </p>
          {shouldPrepareStage && (
            <p style={{ marginTop: "14px", color: "#facc15", fontWeight: 900 }}>
              PREPARA PARA SUBIR AL ESCENARIO PARA DAR EL PREMIO
            </p>
          )}
        </div>
      )}

      {alreadyJoined && galaState.stage !== "results" && hasVoted && (
        <h2 style={{ marginTop: "60px", color: "white" }}>
          Ya emitiste tus 2 votos. Esperando resultados.
        </h2>
      )}
    </div>
  );
}
