import { useCallback, useEffect, useMemo, useState } from "react";
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

const FAREWELL_ANIMATIONS = [
    { key: "spin-disco", emoji: "🪩", title: "Despedida disco", text: "Última vuelta del show", motion: "byeSpin", accent: "#facc15", bg: "rgba(250,204,21,0.14)" },
    { key: "pollito", emoji: "🐥", title: "Pollito escapista", text: "Pío pío, hasta luego", motion: "byeWiggle", accent: "#fde68a", bg: "rgba(253,230,138,0.14)" },
    { key: "confeti", emoji: "🎉", title: "Confeti campeón", text: "Gracias por estar aquí", motion: "byeBounce", accent: "#f472b6", bg: "rgba(244,114,182,0.14)" },
    { key: "torbellino", emoji: "🌀", title: "Torbellino final", text: "La gala gira y se va", motion: "byeFloat", accent: "#38bdf8", bg: "rgba(56,189,248,0.14)" },
    { key: "baile", emoji: "💃", title: "Baile del adiós", text: "Un último paso y fuera", motion: "byeDance", accent: "#fb7185", bg: "rgba(251,113,133,0.14)" },
    { key: "cohete", emoji: "🚀", title: "Cohete de salida", text: "Despegue al menú", motion: "byeZoom", accent: "#22d3ee", bg: "rgba(34,211,238,0.14)" },
    { key: "shake", emoji: "😵‍💫", title: "Shake elegante", text: "Temblor final controlado", motion: "byeShake", accent: "#c084fc", bg: "rgba(192,132,252,0.14)" },
    { key: "sombrero", emoji: "🎩", title: "Sombrero mágico", text: "Puff, desaparece todo", motion: "byeTilt", accent: "#a78bfa", bg: "rgba(167,139,250,0.14)" },
    { key: "estrella", emoji: "🌟", title: "Estrella fugaz", text: "Brilla y se despide", motion: "byePop", accent: "#fbbf24", bg: "rgba(251,191,36,0.14)" },
    { key: "patin", emoji: "🛼", title: "Salida con patines", text: "Desliza directo al cierre", motion: "byeSlide", accent: "#60a5fa", bg: "rgba(96,165,250,0.14)" },
];

export default function Spectator() {
    const [users, setUsers] = useState([]);
    const [galaState, setGalaState] = useState(null);
    const [nominees, setNominees] = useState([]);
    const [presenter, setPresenter] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [localLocation, setLocalLocation] = useState("Cargando ubicación...");
    const [showStartScreen, setShowStartScreen] = useState(false);
    const [farewellVariant, setFarewellVariant] = useState(null);
    const location = useLocation();

    const queryParams = new URLSearchParams(location.search);
    const isVotingScreen = queryParams.get("start") === "true";
    const isShowScreen = queryParams.get("show") === "results";

    const isVotingActive = galaState?.stage === "voting";
    const TOTAL_QUESTIONS = 22;
    const QUESTION_DURATION_MS = 10000;
    const ROUND_DURATION_MS = 150000;
    const revealQuestionNumber = galaState?.revealQuestionNumber || 1;
    const revealResult = galaState?.resultsByGender?.[`q${revealQuestionNumber}`] || null;
    const revealQuestionText = revealResult?.questionText || "";
    const isRevealModeActive = galaState?.revealModeActive === true;
    const [showBlockIndex, setShowBlockIndex] = useState(-1);
    const [closeCountdown, setCloseCountdown] = useState(null);
    const [manualOpenUrl, setManualOpenUrl] = useState("");
    const prepareNewTab = () => {
        const newTab = window.open("about:blank", "_blank");
        if (newTab) newTab.opener = null;
        return newTab;
    };

    const openInNewTabWithFallback = (url) => {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
            setManualOpenUrl(url);
            alert("Safari ha bloqueado la nueva pestaña. Usa el enlace manual para abrirla.");
        }
    };

    const completePreparedTab = (preparedTab, url) => {
        if (preparedTab && !preparedTab.closed) {
            preparedTab.location.href = url;
            setManualOpenUrl("");
            return;
        }

        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
            setManualOpenUrl(url);
            alert("Safari ha bloqueado la nueva pestaña. Usa el enlace manual para abrirla.");
        }
    };

    const getGalaStatusLabel = () => {
        if (galaState?.stage === "voting") return "EN VOTACION";
        if (galaState?.stage === "paused") return "EN PAUSA";
        if (galaState?.stage === "results") return "FINALIZACION";
        return "CARGANDO";
    };

    const getEstimatedGalaTime = () => {
        const now = currentTime.getTime();
        const totalQuestions = TOTAL_QUESTIONS;
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
        const totalQuestions = TOTAL_QUESTIONS;
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

        const preparedTab = prepareNewTab();
        const sessionId = Date.now();

        try {
            setManualOpenUrl("");

            const usersSnapshot = await getDocs(collection(db, "users"));

            const nomineesSnapshot = await getDocs(
                query(collection(db, "nominees"), where("categoryId", "==", galaState.currentCategory))
            );

            const batch = writeBatch(db);

            nomineesSnapshot.forEach((nomineeDoc) => {
                batch.delete(doc(db, "nominees", nomineeDoc.id));
            });

            usersSnapshot.forEach((userDoc) => {
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
                    winnerPhoto: userData.winnerPhoto || "",
                    votes: 0,
                    connected: userData.connected === true,
                    updatedAt: serverTimestamp(),
                });

                batch.update(doc(db, "users", userDoc.id), {
                    joinedSessionId: sessionId,
                    votedRounds: {},
                    votes: 0,
                    currentScreen: "Preparando votación",
                    lastSeen: serverTimestamp(),
                });
            });

            await batch.commit();

            await updateDoc(doc(db, "galaState", "state"), {
                stage: "question",
                galaStarted: true,
                sessionId,
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
                revealFinishedAt: null,
                showPresenter: false,
                lastActionAt: serverTimestamp(),
            });

            completePreparedTab(preparedTab, `${window.location.origin}/spectator?start=true`);
        } catch (error) {
            if (preparedTab && !preparedTab.closed) preparedTab.close();
            console.warn("Error iniciando gala desde spectator:", error);
            alert("No se pudo iniciar la gala. Inténtalo otra vez.");
        }
    };

    const startRevealShow = async () => {
        const preparedTab = prepareNewTab();

        await updateDoc(doc(db, "galaState", "state"), {
            revealModeActive: true,
            revealQuestionNumber: 1,
            revealFinishedAt: null,
            lastActionAt: serverTimestamp(),
        });

        completePreparedTab(preparedTab, `${window.location.origin}/spectator?show=results`);
    };

    const goToNextRevealQuestion = async () => {
        const totalQuestions = TOTAL_QUESTIONS;
        if (revealQuestionNumber >= totalQuestions) {
            await updateDoc(doc(db, "galaState", "state"), {
                revealModeActive: false,
                revealFinishedAt: Date.now(),
                lastActionAt: serverTimestamp(),
            });
            return;
        }

        await updateDoc(doc(db, "galaState", "state"), {
            revealQuestionNumber: revealQuestionNumber + 1,
            lastActionAt: serverTimestamp(),
        });
    };

    const resetGalaAfterShow = useCallback(async () => {
        const [usersSnapshot, nomineesSnapshot] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "nominees")),
        ]);

        const batch = writeBatch(db);

        usersSnapshot.forEach((userDoc) => {
            batch.delete(doc(db, "users", userDoc.id));
        });

        nomineesSnapshot.forEach((nomineeDoc) => {
            batch.delete(doc(db, "nominees", nomineeDoc.id));
        });

        batch.update(doc(db, "galaState", "state"), {
            stage: null,
            galaStarted: false,
            sessionId: null,
            questionStatus: null,
            currentQuestion: null,
            currentQuestionNumber: 1,
            totalQuestions: TOTAL_QUESTIONS,
            currentQuestionChico: null,
            currentQuestionChica: null,
            questionExpiresAt: null,
            votingExpiresAt: null,
            resultsByGender: {},
            resultsClosedAt: null,
            votingEndedByAllVotes: false,
            showPresenter: false,
            revealModeActive: false,
            revealQuestionNumber: 1,
            revealFinishedAt: null,
            roundStartVotes: {},
            lastActionAt: serverTimestamp(),
        });

        await batch.commit();
    }, [TOTAL_QUESTIONS]);

    const connectedUsersForDisplay = useMemo(() => {
        const nowMs = currentTime.getTime();

        return users.filter((user) => {
            if (user.connected === true) return true;
            if (!user.lastSeen) return false;

            const lastSeenDate = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
            return nowMs - lastSeenDate.getTime() <= 15000;
        });
    }, [users, currentTime]);

    const usersById = useMemo(
        () => Object.fromEntries(users.map((user) => [user.id, user])),
        [users]
    );

    const normalizeNominee = (nominee = {}) => ({
        id: nominee.id,
        name: nominee.name || "Anónimo",
        lastname: nominee.lastname || "",
        gender: nominee.gender || "",
        profilePhoto: nominee.profilePhoto || nominee.photo || "",
        photo: nominee.photo || nominee.profilePhoto || "",
        winnerPhoto: nominee.winnerPhoto || "",
        votes: Number(nominee.votes || 0),
    });

    const getNomineeImageUrl = (nominee, options = {}) => {
        const preferWinnerPhoto = options.preferWinnerPhoto === true;
        const userRecord = usersById[nominee?.id] || {};
        const winnerPhoto = nominee?.winnerPhoto || userRecord?.winnerPhoto || "";
        const profilePhoto = nominee?.profilePhoto || nominee?.photo || userRecord?.profilePhoto || userRecord?.photo || "";
        const imageName = preferWinnerPhoto ? (winnerPhoto || profilePhoto) : (profilePhoto || winnerPhoto);
        return imageName
            ? `https://gala-backend.franrvguijo.workers.dev/image/${imageName}`
            : "https://via.placeholder.com/200?text=No+img";
    };

    const sortNomineesByName = (a, b) =>
        `${a.name || ""} ${a.lastname || ""}`.localeCompare(`${b.name || ""} ${b.lastname || ""}`, "es", {
            sensitivity: "base",
        });

    const genderRankingGroupsDesc = useMemo(() => {
        const normalizeGroups = (groups) =>
            [...(groups || [])]
                .map((group) => ({
                    votes: Number(group?.votes || 0),
                    nominees: [...(group?.nominees || [])].map(normalizeNominee).sort(sortNomineesByName),
                }))
                .filter((group) => group.nominees.length > 0)
                .sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0));

        if (revealResult?.rankingsByGender) {
            return {
                chico: normalizeGroups(revealResult.rankingsByGender.chico),
                chica: normalizeGroups(revealResult.rankingsByGender.chica),
            };
        }

        const legacyGroups = revealResult?.rankingGroups || [];
        const splitLegacyGroups = (targetGender) =>
            legacyGroups
                .map((group) => ({
                    votes: Number(group?.votes || 0),
                    nominees: (group?.nominees || [])
                        .map(normalizeNominee)
                        .filter((nominee) => {
                            const gender = (nominee.gender || "").toLowerCase();
                            return targetGender === "chico"
                                ? gender === "chico" || gender === "male"
                                : gender === "chica" || gender === "female";
                        })
                        .sort(sortNomineesByName),
                }))
                .filter((group) => group.nominees.length > 0);

        return {
            chico: normalizeGroups(splitLegacyGroups("chico")),
            chica: normalizeGroups(splitLegacyGroups("chica")),
        };
    }, [revealResult]);

    const allRevealNominees = useMemo(() => {
        const fromStored = (revealResult?.allNominees || []).map(normalizeNominee);
        const fromGenderRankings = [
            ...genderRankingGroupsDesc.chico.flatMap((group) => group.nominees || []),
            ...genderRankingGroupsDesc.chica.flatMap((group) => group.nominees || []),
        ];
        const fallbackNominees = nominees.map(normalizeNominee);
        const source = fromStored.length ? fromStored : (fromGenderRankings.length ? fromGenderRankings : fallbackNominees);
        const uniqueById = new Map();

        source.forEach((nominee) => {
            if (!nominee?.id) return;
            if (!uniqueById.has(nominee.id)) uniqueById.set(nominee.id, nominee);
        });

        return Array.from(uniqueById.values()).sort(sortNomineesByName);
    }, [revealResult, genderRankingGroupsDesc, nominees]);

    const revealPositionSequence = useMemo(() => {
        const assignDisplayPositions = (groups) => {
            let counted = 0;
            return groups.map((group) => {
                const position = counted + 1;
                counted += group.nominees.length;
                return {
                    ...group,
                    position,
                };
            });
        };

        const chicoPositions = assignDisplayPositions(genderRankingGroupsDesc.chico);
        const chicaPositions = assignDisplayPositions(genderRankingGroupsDesc.chica);
        const allPositions = Array.from(new Set([
            ...chicoPositions.map((group) => group.position),
            ...chicaPositions.map((group) => group.position),
        ])).sort((a, b) => b - a);

        const positionBlocks = allPositions.map((position) => ({
            type: "position",
            position,
            chicoGroup: chicoPositions.find((group) => group.position === position) || null,
            chicaGroup: chicaPositions.find((group) => group.position === position) || null,
        }));

        if (!positionBlocks.length) return [];

        return [
            ...positionBlocks,
            {
                type: "fullSummary",
                chicoPositions,
                chicaPositions,
            },
        ];
    }, [genderRankingGroupsDesc]);

    useEffect(() => {
        if (!isShowScreen || !isRevealModeActive) return;

        setShowBlockIndex(-1);
        if (!revealPositionSequence.length) return;

        let intervalId = null;
        const introTimer = setTimeout(() => {
            setShowBlockIndex(0);

            if (revealPositionSequence.length > 1) {
                intervalId = setInterval(() => {
                    setShowBlockIndex((prev) => {
                        if (prev >= revealPositionSequence.length - 1) return prev;
                        return prev + 1;
                    });
                }, 8000);
            }
        }, 10000);

        return () => {
            clearTimeout(introTimer);
            if (intervalId) clearInterval(intervalId);
        };
    }, [isShowScreen, isRevealModeActive, revealPositionSequence, revealQuestionNumber]);

    useEffect(() => {
        const showFinished = !!galaState?.revealFinishedAt;
        if (!isShowScreen || !showFinished) {
            setCloseCountdown(null);
            setFarewellVariant(null);
            return;
        }

        setFarewellVariant((current) => current || FAREWELL_ANIMATIONS[Math.floor(Math.random() * FAREWELL_ANIMATIONS.length)]);
        setCloseCountdown(10);
        const interval = setInterval(() => {
            setCloseCountdown((prev) => {
                if (prev === null) return prev;
                if (prev <= 1) {
                    clearInterval(interval);
                    resetGalaAfterShow()
                        .catch((error) => {
                            console.warn("Error reseteando gala tras finalizar el show:", error);
                        })
                        .finally(() => {
                            window.location.href = "/spectator";
                        });
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isShowScreen, galaState?.revealFinishedAt, resetGalaAfterShow]);

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
        const activeBlock = showBlockIndex >= 0 ? revealPositionSequence[showBlockIndex] : null;
        const totalQuestions = TOTAL_QUESTIONS;
        const showFinished = !!galaState?.revealFinishedAt;

        return (
            <div
                style={{
                    minHeight: "100vh",
                    padding: "clamp(12px, 3.2vw, 30px) clamp(10px, 2.6vw, 24px)",
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
                    @keyframes shimmerSweep {
                        0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
                        20% { opacity: 0.35; }
                        100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
                    }
                    @keyframes byeSpin {
                        0% { transform: rotate(0deg) scale(1); }
                        50% { transform: rotate(10deg) scale(1.06); }
                        100% { transform: rotate(0deg) scale(1); }
                    }
                    @keyframes byeWiggle {
                        0% { transform: translateX(0) rotate(0deg); }
                        25% { transform: translateX(-8px) rotate(-4deg); }
                        75% { transform: translateX(8px) rotate(4deg); }
                        100% { transform: translateX(0) rotate(0deg); }
                    }
                    @keyframes byeBounce {
                        0% { transform: translateY(0) scale(1); }
                        50% { transform: translateY(-10px) scale(1.08); }
                        100% { transform: translateY(0) scale(1); }
                    }
                    @keyframes byeFloat {
                        0% { transform: translateY(0) rotate(0deg); }
                        50% { transform: translateY(-12px) rotate(3deg); }
                        100% { transform: translateY(0) rotate(0deg); }
                    }
                    @keyframes byeDance {
                        0% { transform: rotate(0deg) translateY(0); }
                        20% { transform: rotate(-5deg) translateY(-2px); }
                        40% { transform: rotate(5deg) translateY(-4px); }
                        60% { transform: rotate(-4deg) translateY(-2px); }
                        80% { transform: rotate(4deg) translateY(0); }
                        100% { transform: rotate(0deg) translateY(0); }
                    }
                    @keyframes byeZoom {
                        0% { transform: scale(0.98); }
                        50% { transform: scale(1.09); }
                        100% { transform: scale(0.98); }
                    }
                    @keyframes byeShake {
                        0% { transform: translateX(0); }
                        20% { transform: translateX(-6px); }
                        40% { transform: translateX(6px); }
                        60% { transform: translateX(-4px); }
                        80% { transform: translateX(4px); }
                        100% { transform: translateX(0); }
                    }
                    @keyframes byeTilt {
                        0% { transform: rotate(0deg); }
                        50% { transform: rotate(8deg); }
                        100% { transform: rotate(0deg); }
                    }
                    @keyframes byePop {
                        0% { transform: scale(0.96); }
                        60% { transform: scale(1.08); }
                        100% { transform: scale(0.96); }
                    }
                    @keyframes byeSlide {
                        0% { transform: translateX(0); }
                        50% { transform: translateX(10px); }
                        100% { transform: translateX(0); }
                    }
                    `}
                </style>

                <h1 style={{ margin: 0, color: "#facc15", fontSize: "clamp(28px, 6.5vw, 54px)", letterSpacing: "0.06em", textShadow: "0 0 28px rgba(250,204,21,0.5)" }}>
                    SHOW DE GANADORES
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: "clamp(16px, 3.2vw, 22px)", color: "#bfdbfe", fontWeight: 800 }}>
                    {revealQuestionText || `Pregunta ${revealQuestionNumber}`}
                </p>

                <div style={{ margin: "10px auto 0", width: "100%", maxWidth: "1200px", minHeight: "clamp(340px, 52vh, 430px)", background: "rgba(15,23,42,0.72)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "24px", padding: "clamp(10px, 2vw, 16px)", display: "flex", flexDirection: "column" }}>
                    {showFinished && (
                        <div style={{ marginTop: "42px", animation: "cinematicFade 0.9s ease" }}>
                            <div
                                style={{
                                    width: "min(100%, 560px)",
                                    margin: "0 auto",
                                    padding: "22px 18px",
                                    borderRadius: "26px",
                                    border: `2px solid ${farewellVariant?.accent || "#fde68a"}`,
                                    background: farewellVariant?.bg || "rgba(255,255,255,0.10)",
                                    boxShadow: `0 0 36px ${farewellVariant?.bg || "rgba(255,255,255,0.16)"}`,
                                }}
                            >
                                <div style={{ fontSize: "clamp(52px, 10vw, 84px)", lineHeight: 1, animation: `${farewellVariant?.motion || "byeBounce"} 1.1s infinite ease-in-out` }}>
                                    {farewellVariant?.emoji || "🎬"}
                                </div>
                                <p style={{ margin: "10px 0 0", fontSize: "clamp(28px, 5.8vw, 54px)", fontWeight: 900, color: farewellVariant?.accent || "#fde68a" }}>
                                    {farewellVariant?.title || "GRACIAS POR PARTICIPAR"}
                                </p>
                                <p style={{ margin: "10px 0 0", fontSize: "clamp(18px, 3.8vw, 26px)", color: "#e2e8f0", fontWeight: 800 }}>
                                    {farewellVariant?.text || "Se cierra la pestaña"}
                                </p>
                                <p style={{ margin: "14px 0 0", fontSize: "clamp(16px, 3.2vw, 22px)", color: "#bfdbfe", fontWeight: 800 }}>
                                    Se cierra la pantalla en {closeCountdown ?? 10}s
                                </p>
                            </div>
                        </div>
                    )}

                    {!showFinished && (!isRevealModeActive || (!revealResult && !allRevealNominees.length)) && (
                        <div style={{ marginTop: "58px", animation: "cinematicFade 1s ease" }}>
                            <p style={{ margin: 0, fontSize: "clamp(24px, 5vw, 34px)", fontWeight: 900, color: "#f8fafc" }}>CARGANDO SHOW...</p>
                        </div>
                    )}

                    {!showFinished && isRevealModeActive && allRevealNominees.length > 0 && showBlockIndex < 0 && (
                        <div style={{ marginTop: "48px", animation: "cinematicFade 1.1s ease" }}>
                            <p style={{ margin: 0, fontSize: "46px", fontWeight: 900, color: "#fde68a" }}>TODOS LOS NOMINADOS</p>
                            <p style={{ margin: "10px 0 0", fontSize: "22px", color: "#cbd5e1" }}>10 segundos para ver a todos antes de revelar los puestos</p>
                            <div style={{ marginTop: "12px", color: "#93c5fd", fontWeight: 800, fontSize: "18px" }}>Separados por votos de chico y chica</div>
                            <div style={{ marginTop: "24px", display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
                                {allRevealNominees.map((nominee, idx) => (
                                    <div key={nominee.id || idx} style={{ width: "110px", animation: `nomineePop 0.8s ease ${idx * 0.08}s both`, position: "relative" }}>
                                        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "18px", pointerEvents: "none" }}>
                                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)", animation: `shimmerSweep 2.2s ease ${0.6 + idx * 0.08}s` }} />
                                        </div>
                                        <img
                                            src={getNomineeImageUrl(nominee)}
                                            alt={nominee.name}
                                            style={{ width: "110px", height: "110px", borderRadius: "18px", objectFit: "cover", border: "1px solid rgba(255,255,255,0.3)" }}
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

                    {!showFinished && activeBlock?.type === "position" && (
                        <div style={{ animation: "cinematicFade 1s ease" }}>
                            <p style={{ margin: "0 0 8px", fontSize: "clamp(30px, 6vw, 52px)", color: activeBlock.position === 1 ? "#fde68a" : "#fbbf24", fontWeight: 900 }}>
                                {activeBlock.position === 1 ? "PRIMER PUESTO" : `${activeBlock.position}º PUESTO`}
                            </p>
                            <p style={{ margin: "0 0 20px", fontSize: "clamp(16px, 3.4vw, 22px)", color: "#cbd5e1", fontWeight: 700 }}>
                                Chico y chica tienen posiciones separadas segun sus votos por genero
                            </p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
                                {[
                                    { label: "CHICO", accent: "#38bdf8", group: activeBlock.chicoGroup },
                                    { label: "CHICA", accent: "#f472b6", group: activeBlock.chicaGroup },
                                ].map((column) => (
                                    <div
                                        key={`${activeBlock.position}-${column.label}`}
                                        style={{
                                            background: activeBlock.position === 1 ? "rgba(82,58,10,0.42)" : "rgba(30,41,59,0.65)",
                                            border: `2px solid ${column.accent}`,
                                            borderRadius: "22px",
                                            padding: "18px",
                                            minHeight: "280px",
                                        }}
                                    >
                                        <p style={{ margin: "0 0 10px", color: column.accent, fontWeight: 900, fontSize: "26px", letterSpacing: "0.08em" }}>
                                            {column.label}
                                        </p>
                                        {column.group ? (
                                            <>
                                                <p style={{ margin: "0 0 14px", color: "#e2e8f0", fontWeight: 700 }}>{column.group.votes} votos</p>
                                                <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                                                    {column.group.nominees.map((nominee, idx) => (
                                                <div key={nominee.id} style={{ width: activeBlock.position === 1 ? "clamp(138px, 27vw, 190px)" : "clamp(108px, 22vw, 150px)", animation: `nomineePop 0.8s ease ${idx * 0.12}s both` }}>
                                                    <img
                                                        src={getNomineeImageUrl(nominee, { preferWinnerPhoto: activeBlock.position === 1 })}
                                                        alt={nominee.name}
                                                        style={{
                                                            width: "100%",
                                                            aspectRatio: "1 / 1",
                                                            borderRadius: activeBlock.position === 1 ? "28px" : "20px",
                                                            objectFit: "cover",
                                                            animation: activeBlock.position === 1 ? "trophyGlow 2s infinite ease-in-out" : "none",
                                                        }}
                                                        onError={(event) => {
                                                            event.currentTarget.onerror = null;
                                                            event.currentTarget.src = "https://via.placeholder.com/200?text=No+img";
                                                        }}
                                                    />
                                                    <p style={{ margin: "10px 0 0", fontSize: activeBlock.position === 1 ? "28px" : "20px", fontWeight: 900 }}>
                                                        {nominee.name}
                                                    </p>
                                                </div>
                                            ))}
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color: "#94a3b8", fontSize: "18px", fontWeight: 700, marginTop: "60px" }}>
                                                Sin {column.label.toLowerCase()} en este puesto
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {!showFinished && activeBlock?.type === "fullSummary" && (
                        <div style={{ animation: "cinematicFade 1s ease" }}>
                            <p style={{ margin: "0 0 10px", fontSize: "clamp(28px, 6vw, 46px)", color: "#fde68a", fontWeight: 900 }}>
                                CLASIFICACION COMPLETA
                            </p>
                            <p style={{ margin: "0 0 20px", fontSize: "clamp(15px, 3vw, 20px)", color: "#cbd5e1", fontWeight: 700 }}>
                                Todos los nominados con su puesto final por genero
                            </p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "18px" }}>
                                {[
                                    { label: "CHICO", accent: "#38bdf8", groups: activeBlock.chicoPositions || [] },
                                    { label: "CHICA", accent: "#f472b6", groups: activeBlock.chicaPositions || [] },
                                ].map((column) => (
                                    <div
                                        key={`summary-${column.label}`}
                                        style={{
                                            background: "rgba(15,23,42,0.78)",
                                            border: `2px solid ${column.accent}`,
                                            borderRadius: "22px",
                                            padding: "18px",
                                            textAlign: "left",
                                        }}
                                    >
                                        <p style={{ margin: "0 0 14px", color: column.accent, fontSize: "28px", fontWeight: 900, textAlign: "center" }}>
                                            {column.label}
                                        </p>
                                        {column.groups.length > 0 ? (
                                            column.groups.map((group) => (
                                                <div key={`${column.label}-${group.position}`} style={{ marginBottom: "14px", padding: "12px", borderRadius: "16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
                                                        <span style={{ color: "#f8fafc", fontWeight: 900, fontSize: "20px" }}>
                                                            {group.position === 1 ? "1º PUESTO" : `${group.position}º PUESTO`}
                                                        </span>
                                                        <span style={{ color: "#fde68a", fontWeight: 800 }}>{group.votes} votos</span>
                                                    </div>
                                                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                                                        {group.nominees.map((nominee) => (
                                                            <div key={`summary-${column.label}-${group.position}-${nominee.id}`} style={{ width: "92px", textAlign: "center" }}>
                                                                <img
                                                                    src={getNomineeImageUrl(nominee, { preferWinnerPhoto: group.position === 1 })}
                                                                    alt={nominee.name}
                                                                    style={{ width: "92px", height: "92px", borderRadius: "16px", objectFit: "cover", border: `2px solid ${group.position === 1 ? "#fde68a" : "rgba(255,255,255,0.28)"}` }}
                                                                    onError={(event) => {
                                                                        event.currentTarget.onerror = null;
                                                                        event.currentTarget.src = "https://via.placeholder.com/92?text=No+img";
                                                                    }}
                                                                />
                                                                <p style={{ margin: "8px 0 0", fontSize: "14px", fontWeight: 800, color: "#f8fafc" }}>
                                                                    {nominee.name}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ color: "#94a3b8", fontWeight: 700, textAlign: "center" }}>Sin clasificacion</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {!showFinished && (
                        <div style={{ marginTop: "auto", paddingTop: "10px" }}>
                            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                                <button
                                    onClick={goToNextRevealQuestion}
                                    disabled={!isRevealModeActive}
                                    style={{
                                        width: "min(100%, 320px)",
                                        padding: "12px 18px",
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

                            <p style={{ marginTop: "8px", color: "#94a3b8", fontWeight: 700 }}>
                                Progreso show: {revealQuestionNumber}/{totalQuestions}
                            </p>
                        </div>
                    )}
                </div>
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

                .spectator-mobile-scroll {
                    overflow: visible;
                }

                @media (max-width: 768px) {
                    html, body {
                        overflow-y: auto !important;
                        height: auto !important;
                    }

                    .spectator-mobile-scroll {
                        max-height: 100dvh;
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                        padding-bottom: 26px !important;
                    }

                    .spectator-status-panel {
                        padding: 12px !important;
                        border-radius: 18px !important;
                    }

                    .spectator-status-grid {
                        grid-template-columns: 1fr !important;
                        gap: 10px !important;
                    }

                    .spectator-rules-text {
                        font-size: 14px !important;
                        line-height: 1.45 !important;
                    }
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




            {(isVotingScreen || galaState?.stage === "results") ? (
                
                <div
                    className="spectator-mobile-scroll"
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        gap: "16px",
                        color: "white",
                        padding: "clamp(10px, 2.5vw, 16px) clamp(10px, 4vw, 40px) clamp(20px, 4vw, 40px)",
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
        maxWidth: "min(980px, 96vw)",
        padding: "12px 20px",
        background: "rgba(7, 12, 26, 0.72)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: "16px",
        overflowX: "auto",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    }}
>
    {connectedUsersForDisplay.map((user) => {
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
                            background: "#00ff4c",
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

    {connectedUsersForDisplay.length === 0 && (
        <p style={{ margin: 0, color: "#94a3b8", fontWeight: 700 }}>
            No hay usuarios conectados ahora mismo.
        </p>
    )}
</div>
                    {galaState?.stage !== "results" && (
                        <>
                            <div style={{ maxWidth: "900px" }}>
                                <h1
                                    style={{
                                        fontSize: "clamp(30px, 7vw, 62px)",
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
                                        fontSize: "clamp(16px, 3.5vw, 24px)",
                                        margin: "12px 0 0",
                                        lineHeight: "1.4",
                                        textShadow: "0 0 14px rgba(0,0,0,0.25)",
                                    }}
                                >
                                    Mirad vuestro dispositivo para votar y disfrutad de la gala.
                                </p>
                            </div>

                            <div
                                className="spectator-status-panel"
                                style={{
                                    width: "100%",
                                    maxWidth: "min(980px, 96vw)",
                                    padding: "clamp(12px, 2.8vw, 22px)",
                                    borderRadius: "26px",
                                    background: "rgba(12, 18, 36, 0.92)",
                                    border: "1px solid rgba(255,255,255,0.22)",
                                    backdropFilter: "blur(14px)",
                                    boxShadow: "0 0 60px rgba(0,0,0,0.25)",
                                    color: "#f8fafc",
                                }}
                            >
                                <div className="spectator-status-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
                                    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                        <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Hora actual</p>
                                        <p style={{ margin: 0, fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", color: "#ffffff" }}>
                                            {currentTime.toLocaleTimeString()}
                                        </p>
                                    </div>

                                    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                        <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Estado</p>
                                        <p style={{ margin: 0, fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", color: "#fbbf24" }}>
                                            {getGalaStatusLabel()}
                                        </p>
                                    </div>

                                    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                        <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Hora estimada gala</p>
                                        <p style={{ margin: 0, fontSize: "clamp(24px, 5vw, 36px)", fontWeight: "900", color: "#22d3ee" }}>
                                            {getEstimatedGalaTime()}
                                        </p>
                                        <p style={{ margin: "8px 0 0", fontSize: "15px", color: "#a5f3fc", fontWeight: 700 }}>
                                            Quedan aprox: {getRemainingGalaCountdown()}
                                        </p>
                                    </div>

                                    <div style={{ gridColumn: "1 / -1", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", padding: "16px" }}>
                                        <p style={{ margin: "0 0 6px", opacity: 0.85, color: "#cbd5e1", fontWeight: 600 }}>Reglas rápidas</p>
                                        <p className="spectator-rules-text" style={{ margin: 0, fontSize: "17px", lineHeight: "1.55", fontWeight: "600", color: "#ffffff" }}>
                                            - Cada votación dura 2:30.
                                            <br />- Debes votar una vez en cada género chico/chica.
                                            <br />- Lee bien antes de votar: si te equivocas en el voto, no hay vuelta atrás.
                                            <br />- Si no votas, se cuenta como voto en blanco y gana automáticamente el candidato con más votos.
                                            <br />- El menos votado será el encargado de entregar el trofeo si aplica.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {galaState?.stage === "results" && (
                        <div
                            style={{
                                width: "100%",
                                maxWidth: "min(760px, 94vw)",
                                background: "rgba(12, 18, 36, 0.92)",
                                border: "1px solid rgba(255,255,255,0.22)",
                                borderRadius: "22px",
                                padding: "clamp(14px, 3.2vw, 24px)",
                                boxShadow: "0 0 40px rgba(0,0,0,0.25)",
                            }}
                        >
                            <p style={{ margin: "0 0 12px", fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 900, color: "#fef08a" }}>
                                Votaciones finalizadas
                            </p>

                            {!isRevealModeActive ? (
                                <button
                                    onClick={startRevealShow}
                                    style={{
                                        width: "min(100%, 340px)",
                                        padding: "14px 20px",
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
                                        onClick={() => openInNewTabWithFallback(`${window.location.origin}/spectator?show=results`)}
                                        style={{
                                            width: "min(100%, 340px)",
                                            padding: "12px 18px",
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

                                    {manualOpenUrl && (
                                        <p style={{ margin: "10px 0 0", color: "#f8fafc", fontSize: "14px", wordBreak: "break-all" }}>
                                            Enlace manual: <a href={manualOpenUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd", fontWeight: 800 }}>Abrir pantalla</a>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
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
                            width: "100%",
                            alignSelf: "stretch",
                            marginTop: "30px",
                            display: "flex",
                            gap: "10px",
                            overflowX: "auto",
                            padding: "10px",
                            borderRadius: "16px",
                            background: "rgba(7, 12, 26, 0.72)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {users.length === 0 && (
                            <p style={{ margin: 0, color: "#cbd5e1", fontSize: "15px" }}>
                                No hay usuarios conectados.
                            </p>
                        )}

                        {users.map((user) => {
                            const isConnected = user.connected ?? user.isOnline ?? false;
                            return (
                            <div
                                key={user.id}
                                style={{
                                    width: "130px",
                                    minWidth: "130px",
                                    aspectRatio: "1 / 1",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "8px",
                                    padding: "10px",
                                    background: "linear-gradient(180deg, rgba(223, 126, 243, 0.9), rgba(84, 120, 238, 0.82))",
                                    borderRadius: "14px",
                                    border: "1px solid rgba(255,255,255,0.18)",
                                }}
                            >
                                <div
                                    style={{
                                        position: "relative",
                                        width: "56px",
                                        height: "56px",
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        border: "2px solid rgba(255,255,255,0.35)",
                                        flexShrink: 0,
                                    }}
                                >
                                    <img
                                        src={`https://gala-backend.franrvguijo.workers.dev/image/${user.profilePhoto}`}
                                        alt={user.name}
                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        onError={(event) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src = "https://via.placeholder.com/56?text=No";
                                        }}
                                    />
                                    <span
                                        style={{
                                            position: "absolute",
                                            bottom: "2px",
                                            right: "2px",
                                            width: "10px",
                                            height: "10px",
                                            borderRadius: "50%",
                                            background: isConnected ? "#00ff4c" : "#ff2e2e",
                                            border: "2px solid rgba(0,0,0,0.35)",
                                        }}
                                    />
                                </div>
                                <p
                                    style={{
                                        margin: 0,
                                        color: "white",
                                        fontSize: "13px",
                                        fontWeight: 800,
                                        textAlign: "center",
                                        maxWidth: "100%",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
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