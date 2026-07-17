import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, query, where, deleteDoc } from "firebase/firestore";
import { getQuestionsForGender } from "../questions";

export default function Admin() {
  const [categories, setCategories] = useState([]);
  const [galaState, setGalaState] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

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

  const questionGender = galaState?.currentGenderRound || "chico";
  const availableQuestions = getQuestionsForGender(questionGender);

  // Cambiar categoría activa
  const setCategory = async (categoryId) => {
    await updateDoc(doc(db, "galaState", "state"), {
      currentCategory: categoryId,
      stage: "waiting",
      showPresenter: false
    });
  };

  // Iniciar gala automáticamente
  const startGala = async () => {
    await updateDoc(doc(db, "galaState", "state"), {
      stage: "question",
      currentCategory: galaState?.currentCategory || categories[0]?.id || null,
      questionStatus: "creating",
      currentQuestionNumber: 1,
      totalQuestions: 5,
      currentQuestionChico: null,
      currentQuestionChica: null,
      questionExpiresAt: Date.now() + 10000,
      votingExpiresAt: null,
      resultsByGender: {},
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
  };

  // Iniciar fase de pregunta para una ronda de género
  const startQuestionRound = async (gender) => {
    await updateDoc(doc(db, "galaState", "state"), {
      stage: "question",
      currentGenderRound: gender,
      questionStatus: "creating",
      currentQuestion: null,
      questionExpiresAt: Date.now() + 180000,
      votingExpiresAt: null,
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
  };

  const selectQuestion = async (question) => {
    await updateDoc(doc(db, "galaState", "state"), {
      currentQuestion: {
        text: question.text,
        gender: question.gender,
        createdBy: "admin",
        createdAt: Date.now(),
        expiresAt: Date.now() + 180000,
      },
      stage: "waiting",
      questionStatus: "waiting",
      questionExpiresAt: Date.now() + 180000,
      votingExpiresAt: null,
      showPresenter: false,
      lastActionAt: serverTimestamp(),
    });
    setSelectedQuestionId(question.id);
  };

  // Abrir votaciones después de la pregunta
  const openVoting = async () => {
    if (!galaState?.currentCategory) return;

    // Obtener usuarios conectados como nominados
    const connectedUsers = users.filter(user => user.connected === true);
    
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
  };

  // Avanzar automáticamente a votación cuando la pregunta expire
  useEffect(() => {
    if (!galaState || galaState.stage !== "waiting" || !galaState.currentQuestion || !galaState.questionExpiresAt) return;

    const interval = setInterval(async () => {
      if (Date.now() <= galaState.questionExpiresAt) return;
      clearInterval(interval);

      await openVoting();
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

  if (!galaState) return <p>Cargando...</p>;

  const currentQuestionText = galaState.currentQuestion?.text || "(ninguna seleccionada)";
  const currentQuestionGender = galaState.currentQuestion?.gender || galaState.currentGenderRound || "--";
  const currentScreenLabel = (user) => user.currentScreen || (user.connected ? "En la gala" : "Desconectado");

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
          <div style={{ color: "#cbd5e1", maxWidth: "640px" }}>Administra categorías, elige la pregunta para cada ronda, controla la votación y ve qué pantalla tiene cada votante.</div>
        </div>
        <div style={{ minWidth: "220px", background: "rgba(255,255,255,0.05)", padding: "18px 20px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ fontSize: "13px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em" }}>Estado actual</div>
          <div style={{ marginTop: "10px", fontSize: "16px" }}><strong>Categoría:</strong> {galaState.currentCategory || "Sin categoría"}</div>
          <div style={{ marginTop: "8px", fontSize: "16px" }}><strong>Etapa:</strong> {galaState.stage}</div>
          <div style={{ marginTop: "8px", fontSize: "16px" }}><strong>Pregunta:</strong> {currentQuestionText}</div>
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
            <h2>Seleccionar categoría</h2>
            <div className="button-row">
              {categories.map((cat) => (
                <button key={cat.id} className="admin-button button-secondary" onClick={() => setCategory(cat.id)}>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-section">
            <h2>Preguntas ({questionGender})</h2>
            {availableQuestions.length > 0 ? (
              availableQuestions.map((question) => (
                <div key={question.id} className="question-card" style={{ borderColor: selectedQuestionId === question.id ? "#38bdf8" : undefined }}>
                  <p style={{ margin: 0, fontSize: "16px", color: "#e2e8f0" }}>{question.text}</p>
                  <button
                    className="admin-button button-primary question-button"
                    onClick={() => selectQuestion(question)}
                    style={{ marginTop: "12px" }}
                  >
                    Seleccionar pregunta
                  </button>
                </div>
              ))
            ) : (
              <div style={{ color: "#94a3b8" }}>No hay preguntas para esta ronda.</div>
            )}
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