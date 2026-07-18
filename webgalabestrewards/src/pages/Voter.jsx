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
  const TOTAL_QUESTIONS = getQuestionsForGender("all").length || 5;
  const [userId, setUserId] = useState(null);
  const [userSessionId, setUserSessionId] = useState(null);
  const [removedByAdmin, setRemovedByAdmin] = useState(false);
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
    const voterIdInSession = sessionStorage.getItem("voterId");
    if (voterIdInSession) setUserId(voterIdInSession);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!voterIdInSession && user) setUserId(user.uid);
    });

    return () => unsubscribe();
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

  // Si el admin elimina al usuario, cerrar su sesión móvil automáticamente
  useEffect(() => {
    if (!userId || removedByAdmin) return;

    const userRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(
      userRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data() || {};
          setUserSessionId(userData.joinedSessionId || null);
          return;
        }

        setRemovedByAdmin(true);
        setUserSessionId(null);
        sessionStorage.removeItem("voterId");
        setUserId(null);

        try {
          await auth.signOut();
        } catch (error) {
          console.warn("Error cerrando sesion tras eliminacion por admin:", error);
        }

        alert("El admin cerro tu conexion. Esta pestaña se cerrara.");

        // Solo funciona si la pestaña fue abierta por script; si no, redirigimos.
        window.close();
        setTimeout(() => {
          window.location.href = "/";
        }, 150);
      },
      (error) => {
        console.warn("Error escuchando eliminacion de usuario:", error);
      }
    );

    return () => unsubscribe();
  }, [userId, removedByAdmin]);

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
    const isSessionReadyForUser = !!(
      userId &&
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    if (!isSessionReadyForUser || !galaState?.currentCategory) {
      setHasVoted(false);
      setHasVotedChico(false);
      setHasVotedChica(false);
      return;
    }

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
  }, [userId, userSessionId, galaState, questionVoteKey]);

  // Si falta un género en candidatos, marcar ese voto como completado automáticamente
  useEffect(() => {
    const isSessionReadyForUser = !!(
      userId &&
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    if (!isSessionReadyForUser || !galaState || galaState.stage !== "voting" || !galaState.currentCategory) return;
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
        updates[`votedRounds.${galaState.currentCategory}.${questionVoteKey}.chico`] = "AUTO";
        setHasVotedChico(true);
      }

      if (!hasChicaCandidates && !hasVotedChica) {
        updates[`votedRounds.${galaState.currentCategory}.${questionVoteKey}.chica`] = "AUTO";
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
  }, [userId, userSessionId, galaState, connectedCandidates, hasVotedChico, hasVotedChica, questionVoteKey]);

  // Crear automáticamente preguntas chico/chica cuando inicia la ronda
  useEffect(() => {
    const isSessionReadyForUser = !!(
      userId &&
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    if (!isSessionReadyForUser) return;
    if (!galaState || galaState.stage !== "question") return;
    if (galaState.currentQuestionChico && galaState.currentQuestionChica) return;

    const questions = getQuestionsForGender("all");
    if (!questions.length) return;

    const questionIndex = Math.max(0, (currentQuestionNumber || 1) - 1) % questions.length;
    const chosenQuestion = questions[questionIndex];

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
  }, [userId, userSessionId, galaState, currentQuestionNumber, questionVoteKey, TOTAL_QUESTIONS]);

  // Abrir votación automáticamente cuando termina la pantalla de pregunta
  useEffect(() => {
    const isSessionReadyForUser = !!(
      userId &&
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    if (!isSessionReadyForUser) return;
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
  }, [userId, userSessionId, galaState, currentQuestionNumber, questionVoteKey, TOTAL_QUESTIONS]);

  // Cerrar votación automáticamente a los 2m30s o antes si todos votan ambos géneros
  useEffect(() => {
    const isSessionReadyForUser = !!(
      userId &&
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    if (!isSessionReadyForUser) return;
    if (!galaState || galaState.stage !== "voting" || !galaState.votingExpiresAt) return;

    const interval = setInterval(async () => {
      if (!galaState.currentCategory) return;

      const [nomineesSnapshot, usersSnapshot, allUsersSnapshot] = await Promise.all([
        getDocs(query(collection(db, "nominees"), where("categoryId", "==", galaState.currentCategory))),
        getDocs(query(collection(db, "users"), where("connected", "==", true))),
        getDocs(collection(db, "users")),
      ]);

      const nomineesList = nomineesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const allUsers = allUsersSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const usersById = allUsers.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
      const nowMs = Date.now();
      const connectedUsers = usersSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((user) => {
          if (user.connected !== true) return false;
          if (!user.lastSeen) return true;
          const lastSeenDate = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
          return nowMs - lastSeenDate.getTime() <= 15000;
        });

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

      const votesByNomineeId = allUsers.reduce((acc, voter) => {
        const qVotes = voter?.votedRounds?.[galaState.currentCategory]?.[questionVoteKey] || {};
        [qVotes.chico, qVotes.chica].forEach((targetId) => {
          if (typeof targetId !== "string" || !targetId || targetId === "AUTO") return;
          acc[targetId] = (acc[targetId] || 0) + 1;
        });
        return acc;
      }, {});

      const nomineeIdSet = new Set([
        ...nomineesList.map((nominee) => nominee.id),
        ...Object.keys(votesByNomineeId),
      ]);

      const rankedNominees = Array.from(nomineeIdSet).map((nomineeId) => {
        const userInfo = usersById[nomineeId] || {};
        const nomineeInfo = nomineesList.find((nominee) => nominee.id === nomineeId) || {};
        return {
          id: nomineeId,
          name: userInfo.name || nomineeInfo.name || "Anónimo",
          lastname: userInfo.lastname || nomineeInfo.lastname || "",
          gender: userInfo.gender || nomineeInfo.gender || "",
          votes: Number(votesByNomineeId[nomineeId] || 0),
          profilePhoto: userInfo.profilePhoto || userInfo.photo || nomineeInfo.profilePhoto || nomineeInfo.photo || "",
          photo: userInfo.photo || userInfo.profilePhoto || nomineeInfo.photo || nomineeInfo.profilePhoto || "",
        };
      });

      const chicoNominees = rankedNominees.filter((nominee) => {
        const gender = (nominee.gender || "").toLowerCase();
        return gender === "chico" || gender === "male";
      });
      const chicaNominees = rankedNominees.filter((nominee) => {
        const gender = (nominee.gender || "").toLowerCase();
        return gender === "chica" || gender === "female";
      });

      const sortForWinner = (a, b) => {
        const byVotes = Number(b.votes || 0) - Number(a.votes || 0);
        if (byVotes !== 0) return byVotes;
        return `${a.name || ""} ${a.lastname || ""}`.localeCompare(`${b.name || ""} ${b.lastname || ""}`, "es", {
          sensitivity: "base",
        });
      };

      const buildRankingGroups = (nomineeList) => {
        const groupedByVotes = nomineeList.reduce((acc, nominee) => {
          const votes = Number(nominee.votes || 0);
          if (!acc[votes]) acc[votes] = [];
          acc[votes].push(nominee);
          return acc;
        }, {});

        return Object.entries(groupedByVotes)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([votes, tiedNominees]) => ({
            votes: Number(votes),
            nominees: tiedNominees.sort((a, b) =>
              `${a.name || ""} ${a.lastname || ""}`.localeCompare(`${b.name || ""} ${b.lastname || ""}`, "es", {
                sensitivity: "base",
              })
            ),
          }));
      };

      const topChico = [...chicoNominees].sort(sortForWinner)[0] || null;
      const topChica = [...chicaNominees].sort(sortForWinner)[0] || null;

      const rankingGroupsChico = buildRankingGroups(chicoNominees);
      const rankingGroupsChica = buildRankingGroups(chicaNominees);

      const rankingByVotes = rankedNominees.reduce((acc, nominee) => {
        const votes = Number(nominee.votes || 0);
        if (!acc[votes]) acc[votes] = [];
        acc[votes].push(nominee);
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

      const resultForQuestion = {
        questionText: galaState.currentQuestionChico?.text || galaState.currentQuestionChica?.text || "",
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
        rankingsByGender: {
          chico: rankingGroupsChico,
          chica: rankingGroupsChica,
        },
        allNominees: [...rankedNominees].sort((a, b) =>
          `${a.name || ""} ${a.lastname || ""}`.localeCompare(`${b.name || ""} ${b.lastname || ""}`, "es", {
            sensitivity: "base",
          })
        ),
        winnerIds: winnersGroup.nominees.map((nominee) => nominee.id),
        presenterIds,
        categoryId: galaState.currentCategory || null,
        closedAt: Date.now(),
      };

      if (isLastQuestion) {
        await updateDoc(doc(db, "galaState", "state"), {
          stage: "results",
          resultsClosedAt: Date.now(),
          votingEndedByAllVotes: allConnectedVoted,
          showPresenter: false,
          revealModeActive: false,
          revealQuestionNumber: 1,
          [`resultsByGender.${questionVoteKey}`]: resultForQuestion,
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
        [`resultsByGender.${questionVoteKey}`]: resultForQuestion,
        lastActionAt: serverTimestamp(),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [userId, userSessionId, galaState, currentQuestionNumber, questionVoteKey, TOTAL_QUESTIONS]);

  // Guardar pantalla actual para que el admin la vea
  useEffect(() => {
    if (!userId || !galaState) return;

    const isSessionReadyForUser = !!(
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    const getScreenLabel = () => {
      if (!isSessionReadyForUser) {
        return "Esperando inicio de gala";
      }
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
  }, [userId, userSessionId, galaState, questionDisplayText, hasVoted]);

  // Función para votar
  const vote = async (candidate) => {
    const isSessionReadyForUser = !!(
      userId &&
      galaState?.galaStarted === true &&
      galaState?.sessionId &&
      userSessionId === galaState.sessionId
    );

    if (!isSessionReadyForUser) {
      alert("Aún no ha iniciado la gala para tu sesión. Espera a que el admin o spectator pulse Iniciar gala.");
      return;
    }

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
      [`votedRounds.${galaState.currentCategory}.${questionVoteKey}.${nomineeGender}`]: candidate.id,
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
  const isSessionReadyForUser = !!(
    alreadyJoined &&
    userId &&
    galaState?.galaStarted === true &&
    galaState?.sessionId &&
    userSessionId === galaState.sessionId
  );
  const revealQuestionNumber = galaState?.revealQuestionNumber || 1;
  const revealQuestionKey = `q${revealQuestionNumber}`;
  const revealResult = galaState?.resultsByGender?.[revealQuestionKey] || null;
  const shouldPrepareStage = !!(isSessionReadyForUser && userId && revealResult?.presenterIds?.includes(userId));
  const creatingQuestion = isSessionReadyForUser && galaState.stage === "question";
  const showWaitingForAdmin = alreadyJoined && !isSessionReadyForUser;

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
            marginTop: "28px",
            textAlign: "center",
            animation: "fadeIn 1s ease",
            width: "100%",
            maxWidth: "min(980px, 96vw)",
            marginLeft: "auto",
            marginRight: "auto",
            padding: "0 8px",
          }}
        >
          <h2
            style={{
              color: "white",
              textShadow: "0 0 10px white",
              marginBottom: "10px",
              fontSize: "clamp(20px, 4.8vw, 36px)",
              lineHeight: 1.2,
            }}
          >
            ¡Únete como votante y disfruta de la gala!
          </h2>

          {/* CONTENEDOR DEL QR */}
          <div
            style={{
              marginTop: "20px",
              padding: "clamp(10px, 2.2vw, 20px)",
              borderRadius: "20px",
              animation: "qrGlow 3s infinite ease-in-out",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <QRCodeCanvas
              value="https://webgalabestrewards.pages.dev/join"
              size={420}
              style={{ width: "min(82vw, 420px)", height: "auto", borderRadius: "12px" }}
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
              padding: "clamp(12px, 2.6vw, 14px) clamp(18px, 5vw, 32px)",
              background: "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.4)",
              borderRadius: "999px",
              color: "white",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              fontSize: "clamp(16px, 3.8vw, 20px)",
              fontWeight: "bold",
              letterSpacing: "1px",
              boxShadow: "0 0 15px rgba(255,255,255,0.6)",
              animation: "breatheBtn 3s infinite ease-in-out, fadePop 0.6s ease",
              transition: "all 0.3s ease",
              width: "min(92vw, 320px)",
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
          <h2 style={{ color: "white", marginBottom: "20px", lineHeight: 1.4 }}>
            GRACIAS POR UNIR, ESPERA A QUE SE INICIE LA PARTIDA
          </h2>
        </div>
      )}

      {/* VOTACIÓN */}
      {alreadyJoined && creatingQuestion && (
        <div style={{ marginTop: "40px" }}>
          <h2 style={{ marginBottom: "12px", color: "white" }}>CARGANDO...</h2>
        </div>
      )}

      {alreadyJoined && isSessionReadyForUser && galaState.stage === "waiting" && (
        <div style={{ marginTop: "40px" }}>
          <h2 style={{ marginBottom: "12px", color: "white" }}>CARGANDO...</h2>
        </div>
      )}

      {alreadyJoined && isSessionReadyForUser && galaState.stage === "voting" && !hasVoted && (
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
              maxWidth: "min(980px, 96vw)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              alignItems: "stretch",
              paddingBottom: "8px",
            }}
          >
            {connectedCandidates.map((candidate) => {
              const gender = (candidate.gender || "").toLowerCase();
              const alreadyVotedThisGender = (gender === "female" || gender === "chica") ? hasVotedChica : hasVotedChico;
              const genderLabel = (gender === "female" || gender === "chica") ? "CHICA" : "CHICO";
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
                    borderRadius: "14px",
                    padding: "10px",
                    backdropFilter: "blur(8px)",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    textAlign: "left",
                  }}
                >
                  <img
                    src={photoSrc}
                    alt={candidate.name || "Participante"}
                    width="62"
                    height="62"
                    style={{ borderRadius: "12px", objectFit: "cover", flexShrink: 0 }}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "https://via.placeholder.com/100?text=No+img";
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", color: "white", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {candidate.name || "Anónimo"} {candidate.lastname || ""}
                    </p>
                    <p style={{ margin: "0", color: "#facc15", fontSize: "12px", fontWeight: 800 }}>
                      Género para voto: {genderLabel}
                    </p>
                    <p style={{ margin: "2px 0 0", color: "#d1d5db", fontSize: "12px" }}>
                      {statusLabel}
                    </p>
                  </div>

                  <button
                    onClick={() => vote(candidate)}
                    disabled={alreadyVotedThisGender}
                    style={{
                      width: "min(40vw, 160px)",
                      minWidth: "112px",
                      padding: "10px 10px",
                      background: alreadyVotedThisGender ? "#777" : "gold",
                      border: "none",
                      borderRadius: "10px",
                      cursor: alreadyVotedThisGender ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    {alreadyVotedThisGender ? "Ya votado" : "Votar"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* YA VOTÓ */}
      {alreadyJoined && isSessionReadyForUser && galaState.stage === "results" && (
        <div style={{ marginTop: "60px", color: "white", lineHeight: 1.4 }}>
          <h2>
            GRACIAS POR PARTICIPAR, MIRA A LA PANTALLA DE ESPECTADOR
          </h2>
          {shouldPrepareStage && (
            <p style={{ marginTop: "14px", color: "#facc15", fontWeight: 900 }}>
              PREPARA PARA SUBIR AL ESCENARIO PARA DAR EL PREMIO
            </p>
          )}
        </div>
      )}

      {alreadyJoined && isSessionReadyForUser && galaState.stage !== "results" && hasVoted && (
        <h2 style={{ marginTop: "60px", color: "white" }}>
          Ya emitiste tus 2 votos. Esperando resultados.
        </h2>
      )}
    </div>
  );
}
