import { useCallback, useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, query, where, deleteDoc, writeBatch } from "firebase/firestore";
import { getQuestionsForGender } from "../questions";

export default function Admin() {
  const [categories, setCategories] = useState([]);
  const [galaState, setGalaState] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedTraceQuestionNumber, setSelectedTraceQuestionNumber] = useState(1);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showQuestions, setShowQuestions] = useState(false);
  const TOTAL_QUESTIONS = getQuestionsForGender("all").length || 5;
  const QUESTION_DURATION_MS = 10000;
  const ROUND_DURATION_MS = 150000;

  // Hora actual en tiempo real
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cargar categorías en tiempo real
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "categories"), (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setCategories(list);
    });

    return () => unsubscribe();
  }, []);

  // Monitoreo de usuarios en tiempo real
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsers(list);
    });

    return () => unsubscribe();
  }, []);

  // Cargar estado global de la gala
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "galaState", "state"), (snapshot) => {
      setGalaState(snapshot.data());
    });

    return () => unsubscribe();
  }, []);

  const availableQuestions = getQuestionsForGender("all");

  // Iniciar gala automáticamente
  const startGala = async () => {
    const sessionId = Date.now();
    const usersSnapshot = await getDocs(collection(db, "users"));
    const nomineesSnapshot = await getDocs(
      query(collection(db, "nominees"), where("categoryId", "==", galaState?.currentCategory || categories[0]?.id || null))
    );
    const batch = writeBatch(db);

    nomineesSnapshot.forEach((nomineeDoc) => {
      batch.delete(doc(db, "nominees", nomineeDoc.id));
    });

    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data() || {};

      batch.update(doc(db, "users", userDoc.id), {
        joinedSessionId: sessionId,
        votedRounds: {},
        votes: 0,
        currentScreen: "Preparando votación",
        lastSeen: serverTimestamp(),
      });

      batch.set(doc(db, "nominees", userDoc.id), {
        categoryId: galaState?.currentCategory || categories[0]?.id || null,
        userId: userDoc.id,
        name: userData.name || "Anónimo",
        lastname: userData.lastname || "",
        gender: userData.gender || "",
        photo: userData.profilePhoto || "",
        profilePhoto: userData.profilePhoto || "",
        votes: 0,
        connected: userData.connected === true,
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();

    await updateDoc(doc(db, "galaState", "state"), {
      stage: "question",
      galaStarted: true,
      sessionId,
      currentCategory: galaState?.currentCategory || categories[0]?.id || null,
      questionStatus: "creating",
      currentQuestionNumber: 1,
      totalQuestions: TOTAL_QUESTIONS,
      currentQuestionChico: null,
      currentQuestionChica: null,
      questionExpiresAt: Date.now() + 10000,
      votingExpiresAt: null,
      resultsByGender: {},
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
  };

  // Abrir votaciones después de la pregunta
  const openVoting = useCallback(async () => {
    if (!galaState?.currentCategory) return;
    
    // Crear nominados a partir de usuarios conectados
    const nomineesQuery = query(
      collection(db, "nominees"),
      where("categoryId", "==", galaState.currentCategory)
    );

    const snapshot = await getDocs(nomineesQuery);
    const startVotes = {};
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      startVotes[doc.id] = data.votes || 0;
    });

    await updateDoc(doc(db, "galaState", "state"), {
      stage: "voting",
      votingExpiresAt: Date.now() + 150000,
      questionStatus: "voting",
      roundStartVotes: startVotes,
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
  }, [galaState?.currentCategory]);

  // Avanzar automáticamente a votación cuando la pregunta expire
  useEffect(() => {
    if (!galaState || galaState.stage !== "waiting" || !galaState.currentQuestion || !galaState.questionExpiresAt) return;

    const interval = setInterval(async () => {
      if (Date.now() <= galaState.questionExpiresAt) return;
      clearInterval(interval);

      await openVoting();
    }, 1000);

    return () => clearInterval(interval);
  }, [galaState, openVoting]);

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

  // Cerrar votaciones
  const closeVoting = async () => {
    if (!galaState?.currentCategory) {
      await updateDoc(doc(db, "galaState", "state"), {
        stage: "results",
        showPresenter: false,
        lastActionAt: serverTimestamp(),
      });
      return;
    }

    const nomineesQuery = query(
      collection(db, "nominees"),
      where("categoryId", "==", galaState.currentCategory)
    );

    const snapshot = await getDocs(nomineesQuery);
    const nomineesList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const startVotes = galaState.roundStartVotes || {};

    let newVotes = 0;
    nomineesList.forEach((nominee) => {
      const before = startVotes[nominee.id] ?? (nominee.votes || 0);
      newVotes += Math.max(0, (nominee.votes || 0) - before);
    });

    const sortedByVotes = [...nomineesList].sort((a, b) => (b.votes || 0) - (a.votes || 0));
    const sortedByLeast = [...nomineesList].sort((a, b) => (a.votes || 0) - (b.votes || 0));

    await updateDoc(doc(db, "galaState", "state"), {
      stage: "results",
      showPresenter: false,
      autoWinnerId: newVotes === 0 && sortedByVotes[0]?.id ? sortedByVotes[0].id : null,
      autoDecidedByNoVotes: newVotes === 0,
      leastVotedNomineeId: sortedByLeast[0]?.id || null,
      lastActionAt: serverTimestamp(),
    });
  };

  const pauseVoting = async () => {
    await updateDoc(doc(db, "galaState", "state"), {
      stage: "paused",
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
  };

  const resumeVoting = async () => {
    await updateDoc(doc(db, "galaState", "state"), {
      stage: "voting",
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
  };

  const goToNextVotingFast = async () => {
    if (!galaState) return;

    const totalQuestions = galaState.totalQuestions || TOTAL_QUESTIONS;
    const currentQuestion = galaState.currentQuestionNumber || 1;
    const isLastQuestion = currentQuestion >= totalQuestions;

    if (galaState.stage === "results" && isLastQuestion) {
      window.alert("La gala de votaciones ya termino. Solo queda iniciar el show de ganadores.");
      return;
    }

    if (galaState.stage === "voting") {
      await updateDoc(doc(db, "galaState", "state"), {
        votingExpiresAt: Date.now() - 1000,
        lastActionAt: serverTimestamp(),
      });
      return;
    }

    await openVoting();
  };

  const deleteUser = async (userId) => {
    const confirmDelete = window.confirm("¿Eliminar este usuario de la gala?");
    if (!confirmDelete) return;
    await deleteDoc(doc(db, "users", userId));
  };

  // Calcular tiempo restante de votación
  const getVotingTimeRemaining = () => {
    if (!galaState?.votingExpiresAt) return null;
    const remaining = galaState.votingExpiresAt - currentTime.getTime();
    if (remaining <= 0) return "0:00";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getRemainingToRevealStartMs = () => {
    const now = currentTime.getTime();
    const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;
    const currentQuestionNumber = galaState?.currentQuestionNumber || 1;
    const remainingQuestionCount = Math.max(0, totalQuestions - currentQuestionNumber);

    if (!galaState?.stage) {
      return totalQuestions * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
    }

    if (galaState?.revealModeActive) return 0;
    if (galaState.stage === "results") return 0;

    if (galaState.stage === "voting") {
      const thisVotingRemaining = Math.max(0, (galaState.votingExpiresAt || now) - now);
      return thisVotingRemaining + remainingQuestionCount * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
    }

    if (galaState.stage === "question" || galaState.stage === "waiting") {
      const thisQuestionRemaining = Math.max(0, (galaState.questionExpiresAt || now + QUESTION_DURATION_MS) - now);
      return thisQuestionRemaining + ROUND_DURATION_MS + remainingQuestionCount * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
    }

    return Math.max(0, remainingQuestionCount) * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
  };

  const getRevealStartCountdown = () => {
    if (galaState?.revealModeActive) return "EN CURSO";
    if (galaState?.stage === "results") return "LISTO PARA INICIAR";

    const remainingMs = getRemainingToRevealStartMs();
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const getRevealStartEstimatedTime = () => {
    if (galaState?.revealModeActive) return "AHORA";
    if (galaState?.stage === "results") return "AHORA";

    const now = currentTime.getTime();
    const estimated = new Date(now + getRemainingToRevealStartMs());
    return estimated.toLocaleTimeString();
  };

  const currentQuestionText = galaState?.currentQuestionChico?.text || galaState?.currentQuestionChica?.text || galaState?.currentQuestion?.text || "(ninguna seleccionada)";
  const currentQuestionNumber = galaState?.currentQuestionNumber || 1;
  const usersById = Object.fromEntries(users.map((user) => [user.id, user]));

  const voteTraceByQuestion = (() => {
    if (!galaState?.currentCategory) return [];
    const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;
    const questionBank = getQuestionsForGender("all");

    return Array.from({ length: totalQuestions }, (_, index) => {
      const questionNumber = index + 1;
      const questionVoteKey = `q${questionNumber}`;
      const fallbackQuestionText = questionBank.length
        ? questionBank[(questionNumber - 1) % questionBank.length]?.text || ""
        : "";
      const resultQuestionText = galaState?.resultsByGender?.[questionVoteKey]?.questionText || "";
      const questionText = resultQuestionText || fallbackQuestionText || `Pregunta ${questionNumber}`;

      const entries = users
        .map((user) => {
          const categoryVotes = user.votedRounds?.[galaState.currentCategory] || {};
          const qVotes = categoryVotes[questionVoteKey] || {};
          const chicoTargetId = typeof qVotes.chico === "string" ? qVotes.chico : null;
          const chicaTargetId = typeof qVotes.chica === "string" ? qVotes.chica : null;

          const chicoTargetName =
            chicoTargetId && chicoTargetId !== "AUTO"
              ? `${usersById[chicoTargetId]?.name || "Usuario"} ${usersById[chicoTargetId]?.lastname || ""}`.trim()
              : chicoTargetId === "AUTO"
                ? "AUTO"
                : null;

          const chicaTargetName =
            chicaTargetId && chicaTargetId !== "AUTO"
              ? `${usersById[chicaTargetId]?.name || "Usuario"} ${usersById[chicaTargetId]?.lastname || ""}`.trim()
              : chicaTargetId === "AUTO"
                ? "AUTO"
                : null;

          if (!chicoTargetName && !chicaTargetName) return null;

          const voterName = `${user.name || "Anónimo"} ${user.lastname || ""}`.trim();
          return {
            id: `${user.id}-${questionVoteKey}`,
            voterName,
            chicoTargetName,
            chicaTargetName,
          };
        })
        .filter(Boolean);

      return {
        questionNumber,
        questionVoteKey,
        questionText,
        entries,
      };
    });
  })();

  const selectedQuestionTrace =
    voteTraceByQuestion.find((group) => group.questionNumber === selectedTraceQuestionNumber) || null;

  const currentScreenLabel = (user) => user.currentScreen || (user.connected ? "En la gala" : "Desconectado");

  if (!galaState) return <p>Cargando...</p>;

  return (
    <div style={{ padding: "24px", minHeight: "100vh", background: "linear-gradient(135deg, #0f172a, #3730a3, #6366f1)", color: "#f8fafc" }}>
      <style>{`
        .admin-grid { display: grid; grid-template-columns: 1.4fr 0.9fr; gap: 24px; }
        .admin-card { background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(255,255,255,0.08); border-radius: 28px; padding: 24px; box-shadow: 0 24px 60px rgba(15,23,42,0.35); }
        .admin-section { margin-bottom: 24px; }
        .admin-section h2 { margin-bottom: 16px; font-size: 20px; }
        .button-row { display: flex; flex-wrap: wrap; gap: 12px; }
        .admin-button { padding: 12px 18px; border: none; border-radius: 14px; cursor: pointer; font-weight: 700; transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .admin-button:hover { transform: translateY(-2px); box-shadow: 0 14px 28px rgba(255,255,255,0.12); }
        .button-primary { background: linear-gradient(135deg, #38bdf8, #6366f1); color: white; }
        .button-secondary { background: rgba(255,255,255,0.08); color: #e2e8f0; }
        .button-danger { background: #ef4444; color: white; }
        .button-success { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; }
        .user-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 16px; margin-bottom: 14px; }
        .question-card { background: rgba(255,255,255,0.06); border: 1px dashed rgba(148,163,184,0.45); border-radius: 20px; padding: 18px; margin-bottom: 14px; }
        .question-button { width: 100%; text-align: left; }
        @media (max-width: 960px) { .admin-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "8px" }}>Panel de Admin</div>
          <div style={{ color: "#cbd5e1", maxWidth: "640px" }}>Controla la gala automática, revisa votos en tiempo real y monitorea el estado de cada votante.</div>
        </div>
        <div style={{ minWidth: "220px", background: "rgba(255,255,255,0.05)", padding: "18px 20px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ fontSize: "13px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em" }}>Estado actual</div>
          <div style={{ marginTop: "8px", fontSize: "16px" }}><strong>Etapa:</strong> {galaState.stage}</div>
          <div style={{ marginTop: "8px", fontSize: "16px" }}><strong>Pregunta actual:</strong> {currentQuestionNumber}</div>
          <div style={{ marginTop: "8px", fontSize: "16px" }}><strong>Texto:</strong> {currentQuestionText}</div>
          <div style={{ marginTop: "8px", fontSize: "16px" }}><strong>Inicio show ganadores:</strong> {getRevealStartEstimatedTime()}</div>
          <div style={{ marginTop: "8px", fontSize: "16px", color: "#22d3ee" }}><strong>Falta para show:</strong> {getRevealStartCountdown()}</div>
          {galaState.stage === "voting" && galaState.votingExpiresAt && (
            <div style={{ marginTop: "8px", fontSize: "16px", color: "#fbbf24" }}>
              <strong>Tiempo votación:</strong> {getVotingTimeRemaining()}
            </div>
          )}
        </div>
      </div>

      <div className="admin-grid" style={{ marginTop: "24px" }}>
        <div className="admin-card">
          <div className="admin-section">
            <h2>Banco de preguntas</h2>
            <div className="button-row">
              <button className="admin-button button-secondary" onClick={() => setShowQuestions((prev) => !prev)}>
                {showQuestions ? "Ocultar preguntas" : "Ver las preguntas"}
              </button>
            </div>

            {showQuestions && (
              <div style={{ marginTop: "12px" }}>
                <p style={{ color: "#94a3b8", marginTop: 0 }}>
                  Mostrando preguntas desde questions.js. Este panel solo informa; no cambia el flujo de la gala.
                </p>
                <p style={{ color: "#93c5fd", marginTop: 0, fontWeight: 700 }}>
                  Total en banco: {availableQuestions.length}
                </p>
                {availableQuestions.length > 0 ? (
                  availableQuestions.map((question, index) => {
                    const questionNumber = index + 1;
                    const questionKey = `q${questionNumber}`;
                    const traceGroup = voteTraceByQuestion.find((group) => group.questionNumber === questionNumber);
                    const isTraceSelected = selectedTraceQuestionNumber === questionNumber;

                    return (
                    <div key={question.id} className="question-card" style={{ borderColor: isTraceSelected ? "#38bdf8" : undefined }}>
                      <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#93c5fd", fontWeight: 700 }}>
                        P{questionNumber} ({questionKey})
                      </p>
                      <p style={{ margin: 0, fontSize: "16px", color: "#e2e8f0" }}>{question.text}</p>
                      <div className="button-row" style={{ marginTop: "12px" }}>
                        <button
                          className="admin-button button-secondary"
                          onClick={() => setSelectedTraceQuestionNumber(questionNumber)}
                        >
                          Ver votos P{questionNumber}
                        </button>
                      </div>

                      {isTraceSelected && (
                        <div style={{ marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "10px" }}>
                          <p style={{ margin: "0 0 6px", color: "#cbd5e1", fontSize: "13px" }}>Trazas de voto</p>
                          {traceGroup?.entries?.length > 0 ? (
                            traceGroup.entries.map((entry) => (
                              <div key={entry.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "8px 10px", marginBottom: "6px", color: "#e2e8f0", fontSize: "14px" }}>
                                {entry.voterName}
                                {entry.chicoTargetName ? ` voto a ${entry.chicoTargetName} (chico)` : ""}
                                {entry.chicoTargetName && entry.chicaTargetName ? " | " : ""}
                                {entry.chicaTargetName ? `voto a ${entry.chicaTargetName} (chica)` : ""}
                              </div>
                            ))
                          ) : (
                            <div style={{ color: "#94a3b8", fontSize: "13px" }}>Sin votos registrados en esta pregunta.</div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })
                ) : (
                  <div style={{ color: "#94a3b8" }}>No hay preguntas para esta ronda.</div>
                )}
              </div>
            )}

            <div style={{ marginTop: "14px" }}>
              <h2>Quien voto a quien por pregunta</h2>
              <p style={{ marginTop: 0, color: "#94a3b8", fontSize: "13px" }}>
                Mostrando detalle de P{selectedTraceQuestionNumber}: {selectedQuestionTrace?.questionText || "-"}
              </p>
              <div style={{ maxHeight: "26vh", overflowY: "auto", paddingRight: "4px" }}>
                {voteTraceByQuestion.some((group) => group.entries.length > 0) ? (
                  voteTraceByQuestion.map((group) => (
                    <div key={group.questionVoteKey} style={{ marginBottom: "12px", padding: "10px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                      <div style={{ color: "#93c5fd", fontWeight: 700, marginBottom: "6px" }}>
                        P{group.questionNumber} ({group.questionVoteKey}): {group.questionText}
                      </div>
                      {group.entries.length > 0 ? (
                        group.entries.map((entry) => (
                          <div key={entry.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "8px 10px", marginBottom: "6px", color: "#e2e8f0", fontSize: "14px" }}>
                            {entry.voterName}
                            {entry.chicoTargetName ? ` voto a ${entry.chicoTargetName} (chico)` : ""}
                            {entry.chicoTargetName && entry.chicaTargetName ? " | " : ""}
                            {entry.chicaTargetName ? `voto a ${entry.chicaTargetName} (chica)` : ""}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#94a3b8", fontSize: "13px" }}>Sin votos registrados en esta pregunta.</div>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: "#94a3b8", marginTop: 0 }}>
                    Aun no hay votos registrados.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="admin-section">
            <h2>Control principal</h2>
            <div className="button-row">
              <button className="admin-button button-primary" onClick={startGala}>Iniciar gala</button>
            </div>
            <p style={{ color: "#94a3b8", marginTop: "10px" }}>
              La gala avanza en automático. Los controles de abajo son solo para emergencia.
            </p>
            <div className="button-row" style={{ marginTop: "10px" }}>
              <button className="admin-button button-primary" onClick={goToNextVotingFast}>Siguiente votacion (rapido)</button>
              <button className="admin-button button-success" onClick={openVoting}>Emergencia: abrir votación</button>
              {galaState?.stage === "voting" && <button className="admin-button button-secondary" onClick={pauseVoting}>Emergencia: pausar</button>}
              {galaState?.stage === "paused" && <button className="admin-button button-primary" onClick={resumeVoting}>Emergencia: reanudar</button>}
              <button className="admin-button button-danger" onClick={closeVoting}>Emergencia: cerrar votación</button>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-section">
            <h2>Monitoreo de usuarios</h2>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8" }}>Totales: {users.length}</span>
              <span style={{ color: "#94a3b8" }}>Conectados: {users.filter((user) => user.connected).length}</span>
            </div>
          </div>

          <div className="admin-section" style={{ maxHeight: "66vh", overflowY: "auto" }}>
            {users.length > 0 ? (
              users.map((user) => (
                <div key={user.id} className="user-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "16px", color: "#f8fafc" }}>{user.name || "Anónimo"} {user.lastname || ""}</div>
                      <div style={{ color: "#94a3b8", fontSize: "14px" }}>Género: {user.gender || "N/A"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: user.connected ? "#22c55e" : "#f87171", fontWeight: 700 }}>{user.connected ? "Conectado" : "Desconectado"}</div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>{user.lastSeen?.toDate ? user.lastSeen.toDate().toLocaleTimeString() : "-"}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: "10px", color: "#cbd5e1", fontSize: "14px" }}><strong>Pantalla:</strong> {currentScreenLabel(user)}</div>
                  <div style={{ marginTop: "12px" }}>
                    <button className="admin-button button-danger" style={{ fontSize: "13px", padding: "8px 12px" }} onClick={() => deleteUser(user.id)}>Eliminar</button>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: "#94a3b8" }}>No hay usuarios registrados.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}