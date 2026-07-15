import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../firebase";
import { collection, onSnapshot, doc } from "firebase/firestore";

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

    const isVotingActive = galaState?.stage === "voting";
    const orbitRadius = users.length > 10 ? 150 : users.length > 6 ? 165 : 180;
    const userCardSize = users.length > 10 ? 120 : users.length > 6 ? 140 : 160;

    const getEstimatedEndTime = () => {
        const totalVotes = nominees.reduce((sum, nominee) => sum + (nominee.votes || 0), 0);
        const baseSeconds = 30;
        const extraPerVote = 10;
        const estimatedSeconds = Math.min(300, baseSeconds + totalVotes * extraPerVote);
        const endTime = new Date(currentTime.getTime() + estimatedSeconds * 1000);
        return endTime.toLocaleTimeString();
    };

    const isUserConnected = (user) => {
        if (user.connected === true) return true;
        if (!user.lastSeen) return false;

        const lastSeenDate = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
        return currentTime.getTime() - lastSeenDate.getTime() <= 15000;
    };

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
                            onClick={() => window.open(`${window.location.origin}/spectator?start=true`, "_blank", "noopener,noreferrer")}
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
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "22px",
                        color: "white",
                        padding: "40px",
                        textAlign: "center",
                        animation: "fadeIn 0.8s ease",
                    }}
                >
                    {/* USUARIOS CONECTADOS - ESTILO ZOOM */}
<div
    style={{
        display: "flex",
        gap: "14px",
        padding: "10px 20px",
        background: "rgba(0,0,0,0.35)",
        borderBottom: "1px solid rgba(255,255,255,0.15)",
        overflowX: "auto",
        whiteSpace: "nowrap",
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
                    <div style={{ maxWidth: "720px" }}>
                        <h1
                            style={{
                                fontSize: "52px",
                                margin: 0,
                                color: "gold",
                                textShadow: "0 0 25px rgba(255,215,0,0.7)",
                            }}
                        >
                            HORA DE VOTACIONES
                        </h1>

                        <p
                            style={{
                                fontSize: "22px",
                                margin: "18px 0 0",
                                lineHeight: "1.4",
                                textShadow: "0 0 14px rgba(0,0,0,0.25)",
                            }}
                        >
                            Mirad vuestro dispositivo para votar, y disfruta!!
                        </p>
                    </div>

                    <div
                        style={{
                            width: "100%",
                            maxWidth: "680px",
                            padding: "28px",
                            borderRadius: "26px",
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.18)",
                            backdropFilter: "blur(14px)",
                            boxShadow: "0 0 60px rgba(0,0,0,0.25)",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
                            <div>
                                <p style={{ margin: "0 0 6px", opacity: 0.8 }}>Hora actual</p>
                                <p style={{ margin: 0, fontSize: "28px", fontWeight: "700" }}>
                                    {currentTime.toLocaleTimeString()}
                                </p>
                            </div>

                            <div>
                                <p style={{ margin: "0 0 6px", opacity: 0.8 }}>Inicio estimado de ganadores</p>
                                <p style={{ margin: 0, fontSize: "28px", fontWeight: "700" }}>
                                    {isVotingActive ? getEstimatedEndTime() : "Esperando admin"}
                                </p>
                            </div>

                            <div>
                                <p style={{ margin: "0 0 6px", opacity: 0.8 }}>Estado</p>
                                <p style={{ margin: 0, fontSize: "28px", fontWeight: "700" }}>
                                    {isVotingActive ? "Votación activa" : "Pausado por admin"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {!isVotingActive && (
                        <div
                            style={{
                                maxWidth: "680px",
                                padding: "20px 24px",
                                borderRadius: "20px",
                                background: "rgba(255, 69, 0, 0.14)",
                                border: "1px solid rgba(255, 69, 0, 0.25)",
                                color: "#ffe8d6",
                            }}
                        >
                            <p style={{ margin: 0, fontSize: "18px" }}>
                                La votación está pausada desde el panel de admin. El admin puede reanudarla cuando quiera.
                            </p>
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
