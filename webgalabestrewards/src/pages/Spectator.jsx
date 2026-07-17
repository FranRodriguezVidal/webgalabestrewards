import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    getDocs,
    query,
    where,
    writeBatch,
} from "firebase/firestore";

export default function Spectator() {
    const [users, setUsers] = useState([]);
    const [galaState, setGalaState] = useState(null);
    const [nominees, setNominees] = useState([]);
    const [presenter, setPresenter] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [localLocation, setLocalLocation] = useState("Cargando ubicación...");
    const [showStartScreen, setShowStartScreen] = useState(false);
    const location = useLocation();

    const queryParams = new URLSearchParams(location.search);
    const isVotingScreen = queryParams.get("start") === "true";
    const isShowScreen = queryParams.get("show") === "results";

    const isVotingActive = galaState?.stage === "voting";
    const orbitRadius = users.length > 10 ? 150 : users.length > 6 ? 165 : 180;
    const userCardSize = users.length > 10 ? 120 : users.length > 6 ? 140 : 160;
    const TOTAL_QUESTIONS = 5;
    const QUESTION_DURATION_MS = 10000;
    const ROUND_DURATION_MS = 150000;
    const revealQuestionNumber = galaState?.revealQuestionNumber || 1;
    const revealResult = galaState?.resultsByGender?.[`q${revealQuestionNumber}`] || null;
    const isRevealModeActive = galaState?.revealModeActive === true;
    const [showBlockIndex, setShowBlockIndex] = useState(-1);

    const getGalaStatusLabel = () => {
        if (galaState?.stage === "voting") return "EN VOTACION";
        if (galaState?.stage === "paused") return "EN PAUSA";
        if (galaState?.stage === "results") return "FINALIZACION";
        return "CARGANDO";
    };

    const getEstimatedGalaTime = () => {
        const now = currentTime.getTime();
        const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;
        const currentQuestionNumber = galaState?.currentQuestionNumber || 1;
        const completedQuestions = Math.max(0, currentQuestionNumber - 1);
        const remainingQuestionCount = Math.max(0, totalQuestions - currentQuestionNumber);

        let remainingMs = 0;

        if (!galaState?.stage) {
            remainingMs = totalQuestions * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        } else if (galaState.stage === "results") {
            remainingMs = 0;
        } else if (galaState.stage === "voting") {
            const thisVotingRemaining = Math.max(0, (galaState.votingExpiresAt || now) - now);
            remainingMs = thisVotingRemaining + remainingQuestionCount * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        } else if (galaState.stage === "question" || galaState.stage === "waiting") {
            const thisQuestionRemaining = Math.max(0, (galaState.questionExpiresAt || now + QUESTION_DURATION_MS) - now);
            remainingMs = thisQuestionRemaining + ROUND_DURATION_MS + remainingQuestionCount * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        } else {
            const fallbackRemainingQuestions = Math.max(0, totalQuestions - completedQuestions);
            remainingMs = fallbackRemainingQuestions * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        }

        const estimated = new Date(now + remainingMs);
        return estimated.toLocaleTimeString();
    };

    const getRemainingGalaCountdown = () => {
        const now = currentTime.getTime();
        const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;
        const currentQuestionNumber = galaState?.currentQuestionNumber || 1;
        const remainingQuestionCount = Math.max(0, totalQuestions - currentQuestionNumber);

        let remainingMs = 0;
        if (!galaState?.stage) {
            remainingMs = totalQuestions * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        } else if (galaState.stage === "results") {
            remainingMs = 0;
        } else if (galaState.stage === "voting") {
            const thisVotingRemaining = Math.max(0, (galaState.votingExpiresAt || now) - now);
            remainingMs = thisVotingRemaining + remainingQuestionCount * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        } else if (galaState.stage === "question" || galaState.stage === "waiting") {
            const thisQuestionRemaining = Math.max(0, (galaState.questionExpiresAt || now + QUESTION_DURATION_MS) - now);
            remainingMs = thisQuestionRemaining + ROUND_DURATION_MS + remainingQuestionCount * (QUESTION_DURATION_MS + ROUND_DURATION_MS);
        }

        const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    };

    const startGalaFromSpectator = async () => {
        if (!galaState?.currentCategory) {
            alert("Primero selecciona una categoría desde Admin.");
            return;
        }

        try {
            const connectedUsersSnapshot = await getDocs(
                query(collection(db, "users"), where("connected", "==", true))
            );

            const nomineesSnapshot = await getDocs(
                query(collection(db, "nominees"), where("categoryId", "==", galaState.currentCategory))
            );

            const batch = writeBatch(db);

            nomineesSnapshot.forEach((nomineeDoc) => {
                batch.delete(doc(db, "nominees", nomineeDoc.id));
            });

            connectedUsersSnapshot.forEach((userDoc) => {
                const userData = userDoc.data();
                const nomineeRef = doc(db, "nominees", userDoc.id);
                batch.set(nomineeRef, {
                    categoryId: galaState.currentCategory,
                    userId: userDoc.id,
                    name: userData.name || "Anónimo",
                    lastname: userData.lastname || "",
                    gender: userData.gender || "",
                    photo: userData.profilePhoto || "",
                    profilePhoto: userData.profilePhoto || "",
                    votes: 0,
                    connected: true,
                    updatedAt: serverTimestamp(),
                });
            });

            await batch.commit();

            await updateDoc(doc(db, "galaState", "state"), {
                stage: "question",
                questionStatus: "creating",
                currentQuestionNumber: 1,
                totalQuestions: TOTAL_QUESTIONS,
                currentQuestionChico: null,
                currentQuestionChica: null,
                questionExpiresAt: Date.now() + 10000,
                votingExpiresAt: null,
                resultsByGender: {},
                revealModeActive: false,
                revealQuestionNumber: 1,
                showPresenter: false,
                lastActionAt: serverTimestamp(),
            });

            window.open(`${window.location.origin}/spectator?start=true`, "_blank", "noopener,noreferrer");
        } catch (error) {
            console.warn("Error iniciando gala desde spectator:", error);
            alert("No se pudo iniciar la gala. Inténtalo otra vez.");
        }
    };

    const startRevealShow = async () => {
        await updateDoc(doc(db, "galaState", "state"), {
            revealModeActive: true,
            revealQuestionNumber: 1,
            lastActionAt: serverTimestamp(),
        });

        window.open(`${window.location.origin}/spectator?show=results`, "_blank", "noopener,noreferrer");
    };

    const goToNextRevealQuestion = async () => {
        const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;
        if (revealQuestionNumber >= totalQuestions) {
            await updateDoc(doc(db, "galaState", "state"), {
                revealModeActive: false,
                lastActionAt: serverTimestamp(),
            });
            return;
        }

        await updateDoc(doc(db, "galaState", "state"), {
            revealQuestionNumber: revealQuestionNumber + 1,
            lastActionAt: serverTimestamp(),
        });
    };

    const isUserConnected = (user) => {
        if (user.connected === true) return true;
        if (!user.lastSeen) return false;

        const lastSeenDate = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
        return currentTime.getTime() - lastSeenDate.getTime() <= 15000;
    };

    const rankedGroupsAsc = useMemo(
        () => [...(revealResult?.rankingGroups || [])].sort((a, b) => (a.votes || 0) - (b.votes || 0)),
        [revealResult]
    );

    const allRevealNominees = useMemo(() => {
        const fromRanking = rankedGroupsAsc.flatMap((group) => group.nominees || []);
        if (fromRanking.length) return fromRanking;

        return nominees.map((nominee) => ({
            id: nominee.id,
            name: nominee.name || "Anónimo",
            profilePhoto: nominee.profilePhoto || nominee.photo || "",
            votes: Number(nominee.votes || 0),
        }));
    }, [rankedGroupsAsc, nominees]);

    const effectiveGroupsAsc = useMemo(() => {
        if (rankedGroupsAsc.length) return rankedGroupsAsc;

        const grouped = allRevealNominees.reduce((acc, nominee) => {
            const votes = Number(nominee.votes || 0);
            if (!acc[votes]) acc[votes] = [];
            acc[votes].push(nominee);
            return acc;
        }, {});

        return Object.entries(grouped)
            .map(([votes, nomineesInGroup]) => ({
                votes: Number(votes),
                nominees: nomineesInGroup,
            }))
            .sort((a, b) => (a.votes || 0) - (b.votes || 0));
    }, [rankedGroupsAsc, allRevealNominees]);

    const showSequence = useMemo(() => {
        const groupsAsc = effectiveGroupsAsc;
        if (!groupsAsc.length) return [];

        if (groupsAsc.length <= 2) {
            return [{
                type: "finalTwo",
                groups: groupsAsc,
            }];
        }

        const singles = groupsAsc.slice(0, -2).map((group, idx) => ({
            type: "single",
            group,
            rankLabel: `PUESTO ${groupsAsc.length - idx}`,
        }));

        return [
            ...singles,
            {
                type: "finalTwo",
                groups: groupsAsc.slice(-2),
            },
        ];
    }, [effectiveGroupsAsc]);

    useEffect(() => {
        if (!isShowScreen || !isRevealModeActive) return;

        setShowBlockIndex(-1);
        if (!showSequence.length) return;

        const introTimer = setTimeout(() => {
            setShowBlockIndex(0);
        }, 1600);

        const interval = setInterval(() => {
            setShowBlockIndex((prev) => {
                if (prev >= showSequence.length - 1) return prev;
                return prev + 1;
            });
        }, 3200);

        return () => {
            clearTimeout(introTimer);
            clearInterval(interval);
        };
    }, [isShowScreen, isRevealModeActive, showSequence, revealQuestionNumber]);

    // Hora actual en tiempo real
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fallbackToIp = async () => {
            try {
                const response = await fetch("https://ipapi.co/json/");
                const data = await response.json();
                const city = data.city || data.region || data.country_name;
                setLocalLocation(city ? city : "Ubicación no disponible");
                return;
            } catch (error) {
                setLocalLocation("Ubicación no disponible");
            }
        };

        const reverseGeocode = async (lat, lon) => {
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
                );
                const data = await response.json();
                const address = data.address || {};
                const place =
                    address.city ||
                    address.town ||
                    address.village ||
                    address.county ||
                    address.state ||
                    address.region;
                setLocalLocation(place ? place : "Ubicación no disponible");
            } catch (error) {
                fallbackToIp();
            }
        };

        if (!navigator.geolocation) {
            fallbackToIp();
            return;
        }

        let cancelled = false;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (cancelled) return;
                const { latitude, longitude } = position.coords;
                reverseGeocode(latitude, longitude);
            },
            () => {
                if (cancelled) return;
                fallbackToIp();
            },
            { timeout: 10000 }
        );

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (isVotingScreen && !isVotingActive) {
            setShowStartScreen(true);
        } else {
            setShowStartScreen(false);
        }
    }, [isVotingScreen, isVotingActive]);

    // Usuarios conectados
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
            const list = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            setUsers(list);
        });

        return () => unsubscribe();
    }, []);

    // Estado global de la gala
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "galaState", "state"), (snapshot) => {
            setGalaState(snapshot.data());
        });

        return () => unsubscribe();
    }, []);

    // Nominados de la categoría activa
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

    // Detectar presentador (menos votado)
    useEffect(() => {
        if (!galaState || !galaState.showPresenter) {
            setPresenter(null);
            return;
        }

        if (nominees.length > 0) {
            const sorted = [...nominees].sort((a, b) => a.votes - b.votes);
            setPresenter(sorted[0]); // el menos votado
        }
    }, [galaState, nominees]);

    if (isShowScreen) {
        const activeBlock = showBlockIndex >= 0 ? showSequence[showBlockIndex] : null;
        const totalQuestions = galaState?.totalQuestions || TOTAL_QUESTIONS;

        return (
            <div
                style={{
                    minHeight: "100vh",
                    padding: "30px 24px",
                    color: "white",
                    textAlign: "center",
                    background: "radial-gradient(circle at 20% 20%, rgba(255,215,0,0.2), transparent 35%), radial-gradient(circle at 80% 10%, rgba(59,130,246,0.25), transparent 30%), linear-gradient(140deg, #070b16, #111827, #1e293b)",
                    overflow: "hidden",
                }}
            >
                <style>
                    {`
                    @keyframes cinematicFade {
                        from { opacity: 0; transform: translateY(24px) scale(0.96); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    @keyframes nomineePop {
                        0% { opacity: 0; transform: translateY(22px) scale(0.9); }
                        70% { opacity: 1; transform: translateY(-4px) scale(1.04); }
                        100% { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    @keyframes trophyGlow {
                        0% { box-shadow: 0 0 18px rgba(250,204,21,0.35); }
                        50% { box-shadow: 0 0 42px rgba(250,204,21,0.85); }
                        100% { box-shadow: 0 0 18px rgba(250,204,21,0.35); }
                    }
                    `}
                </style>

                <h1 style={{ margin: 0, color: "#facc15", fontSize: "54px", letterSpacing: "0.06em", textShadow: "0 0 28px rgba(250,204,21,0.5)" }}>
                    SHOW DE GANADORES
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: "22px", color: "#bfdbfe", fontWeight: 800 }}>
                    Pregunta {revealQuestionNumber}
                </p>

                <div style={{ margin: "20px auto 0", maxWidth: "1200px", minHeight: "520px", background: "rgba(15,23,42,0.72)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "24px", padding: "24px" }}>
                    {(!isRevealModeActive || (!revealResult && !allRevealNominees.length)) && (
                        <div style={{ marginTop: "100px", animation: "cinematicFade 1s ease" }}>
                            <p style={{ margin: 0, fontSize: "34px", fontWeight: 900, color: "#f8fafc" }}>CARGANDO SHOW...</p>
                        </div>
                    )}

                    {isRevealModeActive && allRevealNominees.length > 0 && showBlockIndex < 0 && (
                        <div style={{ marginTop: "100px", animation: "cinematicFade 1.1s ease" }}>
                            <p style={{ margin: 0, fontSize: "46px", fontWeight: 900, color: "#fde68a" }}>NOMINADOS</p>
                            <p style={{ margin: "10px 0 0", fontSize: "22px", color: "#cbd5e1" }}>Comienza la revelacion...</p>
                            <div style={{ marginTop: "24px", display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
                                {allRevealNominees.map((nominee, idx) => (
                                    <div key={nominee.id || idx} style={{ width: "130px", animation: `nomineePop 0.7s ease ${idx * 0.05}s both` }}>
                                        <img
                                            src={nominee.profilePhoto ? `https://gala-backend.franrvguijo.workers.dev/image/${nominee.profilePhoto}` : "https://via.placeholder.com/130?text=No+img"}
                                            alt={nominee.name}
                                            style={{ width: "130px", height: "130px", borderRadius: "16px", objectFit: "cover", border: "1px solid rgba(255,255,255,0.3)" }}
                                            onError={(event) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = "https://via.placeholder.com/130?text=No+img";
                                            }}
                                        />
                                        <p style={{ margin: "7px 0 0", fontSize: "14px", fontWeight: 800, color: "#ffffff" }}>
                                            {nominee.name}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeBlock?.type === "single" && (
                        <div style={{ animation: "cinematicFade 0.9s ease" }}>
                            <p style={{ margin: "0 0 12px", fontSize: "40px", color: "#fbbf24", fontWeight: 900 }}>{activeBlock.rankLabel}</p>
                            <p style={{ margin: "0 0 20px", fontSize: "22px", color: "#e2e8f0" }}>{activeBlock.group.votes} votos</p>
                            <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                                {activeBlock.group.nominees.map((nominee, idx) => (
                                    <div key={nominee.id} style={{ width: "170px", animation: `nomineePop 0.8s ease ${idx * 0.08}s both` }}>
                                        <img
                                            src={nominee.profilePhoto ? `https://gala-backend.franrvguijo.workers.dev/image/${nominee.profilePhoto}` : "https://via.placeholder.com/170?text=No+img"}
                                            alt={nominee.name}
                                            style={{ width: "170px", height: "170px", borderRadius: "22px", objectFit: "cover", border: "2px solid rgba(255,255,255,0.3)" }}
                                            onError={(event) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = "https://via.placeholder.com/170?text=No+img";
                                            }}
                                        />
                                        <p style={{ margin: "10px 0 0", fontSize: "18px", fontWeight: 800 }}>{nominee.name}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeBlock?.type === "finalTwo" && (
                        <div style={{ animation: "cinematicFade 1s ease" }}>
                            <p style={{ margin: "0 0 14px", fontSize: "40px", color: "#fef08a", fontWeight: 900 }}>GRAN FINAL: PUESTO 1 Y 2</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                                {activeBlock.groups.map((group, groupIdx) => (
                                    <div
                                        key={`${groupIdx}-${group.votes}`}
                                        style={{
                                            background: groupIdx === activeBlock.groups.length - 1 ? "rgba(82,58,10,0.42)" : "rgba(30,41,59,0.65)",
                                            border: groupIdx === activeBlock.groups.length - 1 ? "2px solid rgba(250,204,21,0.55)" : "1px solid rgba(255,255,255,0.2)",
                                            borderRadius: "18px",
                                            padding: "16px",
                                        }}
                                    >
                                        <p style={{ margin: "0 0 10px", color: groupIdx === activeBlock.groups.length - 1 ? "#fde68a" : "#bfdbfe", fontWeight: 900, fontSize: "24px" }}>
                                            {groupIdx === activeBlock.groups.length - 1 ? "PUESTO 1" : "PUESTO 2"}
                                        </p>
                                        <p style={{ margin: "0 0 14px", color: "#e2e8f0", fontWeight: 700 }}>{group.votes} votos</p>
                                        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                                            {group.nominees.map((nominee) => (
                                                <div key={nominee.id} style={{ width: groupIdx === activeBlock.groups.length - 1 ? "250px" : "180px" }}>
                                                    <img
                                                        src={nominee.profilePhoto ? `https://gala-backend.franrvguijo.workers.dev/image/${nominee.profilePhoto}` : "https://via.placeholder.com/200?text=No+img"}
                                                        alt={nominee.name}
                                                        style={{
                                                            width: groupIdx === activeBlock.groups.length - 1 ? "250px" : "180px",
                                                            height: groupIdx === activeBlock.groups.length - 1 ? "250px" : "180px",
                                                            borderRadius: groupIdx === activeBlock.groups.length - 1 ? "28px" : "20px",
                                                            objectFit: "cover",
                                                            animation: groupIdx === activeBlock.groups.length - 1 ? "trophyGlow 2s infinite ease-in-out" : "none",
                                                        }}
                                                        onError={(event) => {
                                                            event.currentTarget.onerror = null;
                                                            event.currentTarget.src = "https://via.placeholder.com/200?text=No+img";
                                                        }}
                                                    />
                                                    <p style={{ margin: "10px 0 0", fontSize: groupIdx === activeBlock.groups.length - 1 ? "28px" : "20px", fontWeight: 900 }}>
                                                        {nominee.name}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: "18px", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                        onClick={goToNextRevealQuestion}
                        disabled={!isRevealModeActive}
                        style={{
                            padding: "12px 24px",
                            borderRadius: "999px",
                            border: "none",
                            background: !isRevealModeActive ? "#64748b" : "#22c55e",
                            color: "#052e16",
                            fontSize: "16px",
                            fontWeight: 900,
                            cursor: !isRevealModeActive ? "not-allowed" : "pointer",
                        }}
                    >
                        {revealQuestionNumber >= totalQuestions ? "FINALIZAR SHOW" : "SIGUIENTE PREGUNTA"}
                    </button>
                </div>

                <p style={{ marginTop: "10px", color: "#94a3b8", fontWeight: 700 }}>
                    Progreso show: {revealQuestionNumber}/{totalQuestions}
                </p>
            </div>
        );
    }


    return (
        <div
            style={{
                padding: "40px",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                minHeight: "100vh",
                background: "linear-gradient(135deg, #3f1dcb, #1a73e8, #ffffff, #ff66cc)",
            }}
        >
            {/* LUCES Y ANIMACIONES */}
            <div
                style={{
                    position: "absolute",
                    top: "-20%",
                    left: "-10%",
                    width: "300px",
                    height: "300px",
                    background: "rgba(255, 255, 255, 0.15)",
                    transform: "rotate(45deg)",
                    filter: "blur(40px)",
                    animation: "lightMove1 6s infinite linear"
                }}
            ></div>

            <div
                style={{
                    position: "absolute",
                    top: "-20%",
                    right: "-10%",
                    width: "300px",
                    height: "300px",
                    background: "rgba(255, 255, 255, 0.15)",
                    transform: "rotate(-45deg)",
                    filter: "blur(40px)",
                    animation: "lightMove2 6s infinite linear"
                }}
            ></div>

            <div
                style={{
                    position: "absolute",
                    top: "10%",
                    left: "15%",
                    width: "150px",
                    height: "150px",
                    background: "rgba(255,255,255,0.25)",
                    borderRadius: "50%",
                    animation: "float1 6s infinite ease-in-out",
                    filter: "blur(4px)",
                }}
            ></div>

            <style>
                {`
                html, body {
                    overflow: hidden;
                    height: 100%;
                }

                @keyframes lightMove1 {
                    0% { transform: translateY(0) rotate(45deg); }
                    50% { transform: translateY(200px) rotate(45deg); }
                    100% { transform: translateY(0) rotate(45deg); }
                }

                @keyframes lightMove2 {
                    0% { transform: translateY(0) rotate(-45deg); }
                    50% { transform: translateY(200px) rotate(-45deg); }
                    100% { transform: translateY(0) rotate(-45deg); }
                }

                @keyframes float1 {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-40px); }
                    100% { transform: translateY(0px); }
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes pulseGlow {
                    0% { transform: scale(1); text-shadow: 0 0 20px gold; }
                    50% { transform: scale(1.05); text-shadow: 0 0 40px gold; }
                    100% { transform: scale(1); text-shadow: 0 0 20px gold; }
                }

                @keyframes orbit {
                    0% { transform: rotate(var(--start-angle, 0deg)) translateY(-180px) rotate(calc(-1 * var(--start-angle, 0deg))); }
                    50% { transform: rotate(calc(var(--start-angle, 0deg) + 180deg)) translateY(-180px) rotate(calc(-1 * var(--start-angle, 0deg) - 180deg)); }
                    100% { transform: rotate(calc(var(--start-angle, 0deg) + 360deg)) translateY(-180px) rotate(calc(-1 * var(--start-angle, 0deg) - 360deg)); }
                }

                @keyframes spinSlow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                `}
            </style>

            {!isVotingScreen && (
                <>
                    <div
                        style={{
                            marginBottom: "20px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "12px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                                alignItems: "center",
                            }}
                        >
                            <span style={{ color: "gold", fontSize: "28px", fontWeight: "bold", textShadow: "0 0 15px gold" }}>
                                Pantalla del Espectador
                            </span>
                            <span style={{ color: "white", fontSize: "18px", textShadow: "0 0 10px rgba(255,255,255,0.8)" }}>
                                Hora actual: {currentTime.toLocaleTimeString()}
                            </span>
                            <span style={{ color: "white", fontSize: "16px", textShadow: "0 0 8px rgba(255,255,255,0.6)" }}>
                                Ubicación local: {localLocation}
                            </span>
                        </div>

                        <button
                            onClick={startGalaFromSpectator}
                            style={{
                                padding: "14px 28px",
                                fontSize: "16px",
                                background: "gold",
                                border: "none",
                                borderRadius: "999px",
                                color: "black",
                                cursor: "pointer",
                                boxShadow: "0 0 24px rgba(255, 223, 0, 0.65)",
                                marginTop: "10px",
                            }}
                        >
                            Iniciar Gala
                        </button>
                    </div>

                    {showStartScreen && (
                        <div
                            style={{
                                position: "fixed",
                                inset: 0,
                                background: "rgba(0,0,0,0.72)",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                zIndex: 100,
                            }}
                        >
                            <div
                                style={{
                                    width: "92%",
                                    maxWidth: "420px",
                                    background: "rgba(117, 136, 201, 0.96)",
                                    borderRadius: "22px",
                                    padding: "28px",
                                    color: "white",
                                    boxShadow: "0 0 40px rgba(0,0,0,0.4)",
                                    textAlign: "center",
                                }}
                            >
                                <h2 style={{ marginBottom: "16px", color: "gold" }}>Iniciar Gala</h2>
                                <p style={{ fontSize: "16px", lineHeight: "24px", marginBottom: "24px" }}>
                                    El espectador está listo para comenzar la gala. Presiona cerrar para volver al panel o espera la transición al siguiente estado.
                                </p>
                                <button
                                    onClick={() => setShowStartScreen(false)}
                                    style={{
                                        padding: "12px 24px",
                                        background: "gold",
                                        border: "none",
                                        borderRadius: "999px",
                                        color: "black",
                                        cursor: "pointer",
                                        fontWeight: "bold",
                                    }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}




            {isVotingScreen ? (
                
                <div
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        gap: "16px",
                        color: "white",
                        padding: "16px 40px 40px",
                        textAlign: "center",
                        animation: "fadeIn 0.8s ease",
                    }}
                >
                    {/* USUARIOS CONECTADOS - ESTILO ZOOM */}
<h2 style={{ margin: "0", color: "#ffffff", textShadow: "0 0 10px rgba(0,0,0,0.45)" }}>
    USUARIOS CONECTADOS
</h2>
<div
    style={{
        display: "flex",
        gap: "14px",
        width: "100%",
        maxWidth: "980px",
        padding: "12px 20px",
        background: "rgba(7, 12, 26, 0.72)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: "16px",
        overflowX: "auto",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    }}
>
    {users.map((user) => {
        const isConnected = isUserConnected(user);
        return (
            <div
                key={user.id}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "80px",
                    padding: "6px 0",
                }}
            >
                <div style={{ position: "relative" }}>
                    <img
                        src={`https://gala-backend.franrvguijo.workers.dev/image/${user.profilePhoto}`}
                        alt={user.name}
                        style={{
                            width: "55px",
                            height: "55px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            boxShadow: "0 0 8px rgba(255,255,255,0.35)",
                        }}
                        onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = "https://via.placeholder.com/55?text=No+img";
                        }}
                    />

                    {/* Indicador de conexión */}
                    <span
                        style={{
                            position: "absolute",
                            bottom: "2px",
                            right: "2px",
                            width: "14px",
                            height: "14px",
                            borderRadius: "50%",
                            background: isConnected ? "#00ff4c" : "#ff2e2e",
                            border: "2px solid black",
                        }}
                    ></span>
                </div>

                <p
                    style={{
                        margin: "4px 0 0",
                        fontSize: "12px",
                        color: "white",
                        textAlign: "center",
                        maxWidth: "70px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {user.name}
                </p>
            </div>
        );
    })}
</div>
                    <div style={{ maxWidth: "900px" }}>
                        <h1
                            style={{
                                fontSize: "62px",
                                margin: 0,
                                color: "gold",
                                letterSpacing: "0.03em",
                                textShadow: "0 0 30px rgba(255,215,0,0.72)",
                            }}
                        >
                            HORA DE VOTACIONES
                        </h1>

                        <p
                            style={{
                                fontSize: "24px",
                                margin: "12px 0 0",
                                lineHeight: "1.4",
                                textShadow: "0 0 14px rgba(0,0,0,0.25)",
                            }}
                        >
                            Mirad vuestro dispositivo para votar y disfrutad de la gala.
                        </p>
                    </div>

                    <div
                        style={{
                            width: "100%",
                            maxWidth: "980px",
                            padding: "22px",
                            borderRadius: "26px",
                            background: "rgba(12, 18, 36, 0.92)",
                            border: "1px solid rgba(255,255,255,0.22)",
                            backdropFilter: "blur(14px)",
                            boxShadow: "0 0 60px rgba(0,0,0,0.25)",
                            color: "#f8fafc",
                        }}
                    >
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
                            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Hora actual</p>
                                <p style={{ margin: 0, fontSize: "36px", fontWeight: "900", color: "#ffffff" }}>
                                    {currentTime.toLocaleTimeString()}
                                </p>
                            </div>

                            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Estado</p>
                                <p style={{ margin: 0, fontSize: "36px", fontWeight: "900", color: "#fbbf24" }}>
                                    {getGalaStatusLabel()}
                                </p>
                            </div>

                            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Hora estimada gala</p>
                                <p style={{ margin: 0, fontSize: "36px", fontWeight: "900", color: "#22d3ee" }}>
                                    {getEstimatedGalaTime()}
                                </p>
                                <p style={{ margin: "8px 0 0", fontSize: "15px", color: "#a5f3fc", fontWeight: 700 }}>
                                    Quedan aprox: {getRemainingGalaCountdown()}
                                </p>
                            </div>

                            <div style={{ gridColumn: "1 / -1", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Reglas rápidas</p>
                                <p style={{ margin: 0, fontSize: "17px", lineHeight: "1.55", fontWeight: "600", color: "#ffffff" }}>
                                    - Cada votación dura 2:30.
                                    <br />- Debes votar una vez en cada género chico/chica.
                                    <br />- Si no votas, se cuenta como voto en blanco y gana automáticamente el candidato con más votos.
                                    <br />- El menos votado será el encargado de entregar el trofeo si aplica.
                                </p>
                            </div>

                            {galaState?.stage === "results" && (
                                <div style={{ gridColumn: "1 / -1", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "16px", padding: "20px" }}>
                                    <p style={{ margin: "0 0 12px", fontSize: "24px", fontWeight: 900, color: "#fef08a" }}>
                                        Votaciones finalizadas
                                    </p>

                                    {!isRevealModeActive ? (
                                        <button
                                            onClick={startRevealShow}
                                            style={{
                                                padding: "14px 30px",
                                                borderRadius: "999px",
                                                border: "none",
                                                background: "gold",
                                                color: "#111827",
                                                fontSize: "18px",
                                                fontWeight: 900,
                                                cursor: "pointer",
                                                boxShadow: "0 0 18px rgba(255,215,0,0.45)",
                                            }}
                                        >
                                            REVELAR GANADORES
                                        </button>
                                    ) : (
                                        <div style={{ marginTop: "8px" }}>
                                            <p style={{ margin: "0 0 10px", color: "#93c5fd", fontWeight: 900, fontSize: "20px" }}>
                                                Show activo en pestaña aparte
                                            </p>
                                            <button
                                                onClick={() => window.open(`${window.location.origin}/spectator?show=results`, "_blank", "noopener,noreferrer")}
                                                style={{
                                                    padding: "12px 24px",
                                                    borderRadius: "999px",
                                                    border: "none",
                                                    background: "#38bdf8",
                                                    color: "#082f49",
                                                    fontSize: "16px",
                                                    fontWeight: 900,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                ABRIR PANTALLA SHOW
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            ) : (
                <>
                    {/* PRESENTADOR */}
                    {presenter && (
                        <div
                            style={{
                                border: "3px solid gold",
                                padding: "20px",
                                marginBottom: "20px",
                                background: "rgba(255,255,255,0.2)",
                                borderRadius: "10px",
                            }}
                        >
                            <h2 style={{ color: "gold" }}>Presentador</h2>
                            <img
                                src={
                                    presenter.photo
                                        ? `https://gala-backend.franrvguijo.workers.dev/image/${presenter.photo}`
                                        : presenter.profilePhoto
                                            ? `https://gala-backend.franrvguijo.workers.dev/image/${presenter.profilePhoto}`
                                            : "https://via.placeholder.com/120?text=Sin+imagen"
                                }
                                onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = "https://via.placeholder.com/120?text=Sin+imagen";
                                }}
                                alt={presenter.name}
                                width="120"
                                style={{ borderRadius: "50%", objectFit: "cover" }}
                            />

                            <p style={{ fontSize: "24px", color: "white" }}>{presenter.name}</p>
                            <p style={{ color: "white" }}>Votos: {presenter.votes}</p>
                        </div>
                    )}

                    {/* USUARIOS CONECTADOS */}
                    <h2 style={{ color: "white", marginTop: "20px" }}>Usuarios conectados</h2>

                    <div
                        style={{
                            position: "relative",
                            width: "100%",
                            height: "420px",
                            marginTop: "30px",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                width: "360px",
                                height: "360px",
                                borderRadius: "50%",
                                background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 60%)",
                                boxShadow: "0 0 40px rgba(255,255,255,0.16)",
                                zIndex: 0,
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                width: "340px",
                                height: "340px",
                                borderRadius: "50%",
                                border: "2px solid rgba(255,255,255,0.25)",
                                boxShadow: "0 0 30px rgba(255,255,255,0.18)",
                                animation: "spinSlow 30s linear infinite",
                                zIndex: 0,
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                width: "190px",
                                height: "190px",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.12)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                boxShadow: "0 0 30px rgba(255,255,255,0.16)",
                                zIndex: 0,
                            }}
                        />

                        {users.map((user, index) => {
                            const angle = (360 / Math.max(users.length, 1)) * index;
                            const isConnected = user.connected ?? user.isOnline ?? false;
                            return (
                                <div
                                    key={user.id}
                                    className="userCard"
                                    style={{
                                        position: "absolute",
                                        left: "50%",
                                        top: "50%",
                                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${orbitRadius}px) rotate(-${angle}deg)`,
                                        width: `${userCardSize}px`,
                                        padding: userCardSize > 140 ? "16px 14px" : "12px 10px",
                                        background: "linear-gradient(180deg, rgba(223, 126, 243, 0.92), rgba(84, 120, 238, 0.86))",
                                        borderRadius: "24px",
                                        border: "1px solid rgba(255,255,255,0.16)",
                                        backdropFilter: "blur(16px)",
                                        boxShadow: "0 0 24px rgba(0,0,0,0.35)",
                                        textAlign: "center",
                                        animation: `orbit 12s linear infinite`,
                                        animationDelay: `${index * 0.2}s`,
                                        "--start-angle": `${angle}deg`,
                                        zIndex: 2,
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "relative",
                                            width: "90px",
                                            height: "90px",
                                            margin: "0 auto 10px",
                                            borderRadius: "50%",
                                            overflow: "hidden",
                                            border: "2px solid rgba(255,255,255,0.3)",
                                            boxShadow: "0 0 16px rgba(255,255,255,0.25)",
                                        }}
                                    >
                                        <img
                                            src={`https://gala-backend.franrvguijo.workers.dev/image/${user.profilePhoto}`}
                                            alt={user.name}
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
                                            }}
                                            onError={(event) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = "https://via.placeholder.com/90?text=No+img";
                                            }}
                                        />
                                        <span
                                            style={{
                                                position: "absolute",
                                                bottom: "4px",
                                                right: "4px",
                                                width: "16px",
                                                height: "16px",
                                                borderRadius: "50%",
                                                background: isConnected ? "#00ff4c" : "#ff2e2e",
                                                border: "2px solid rgba(0,0,0,0.35)",
                                            }}
                                        />
                                    </div>
                                    <p style={{ color: "white", fontSize: "14px", fontWeight: "700", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {user.name}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

        </div>
    );
}