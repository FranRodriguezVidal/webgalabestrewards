import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc } from "firebase/firestore";

export default function Spectator() {
    const [users, setUsers] = useState([]);
    const [galaState, setGalaState] = useState(null);
    const [nominees, setNominees] = useState([]);
    const [presenter, setPresenter] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [countdown, setCountdown] = useState("");
    const [galaStartTime, setGalaStartTime] = useState(null);

    // Hora actual en tiempo real
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

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

    // ⭐ Cálculo de hora estimada + cuenta atrás
    useEffect(() => {
        if (!galaState) return;

        const total = galaState.totalCategories || 0;
        const voted = galaState.votedCategories || [];

        const remaining = total - voted.length;

        // Cada votación dura 2 minutos
        let estimatedMinutes = remaining * 2;

        // Si la votación está activa → restar 2 minutos
        if (galaState.stage === "voting") {
            estimatedMinutes -= 2;
        }

        const now = new Date();
        const galaStart = new Date(now.getTime() + estimatedMinutes * 60000);

        setGalaStartTime(galaStart);

        const interval = setInterval(() => {
            const now2 = new Date();
            const diff = galaStart - now2;

            if (diff <= 0) {
                setCountdown("¡La gala está comenzando!");
                return;
            }

            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);

            setCountdown(`${mins} min ${secs} s`);
        }, 1000);

        return () => clearInterval(interval);
    }, [galaState]);

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
                `}
            </style>

            {/* CUENTA ATRÁS */}
            <h1
                style={{
                    color: "gold",
                    fontSize: "80px",
                    marginBottom: "20px",
                    textShadow: "0 0 20px gold, 0 0 40px white",
                    animation: "pulseGlow 2s infinite ease-in-out"
                }}
            >
                {countdown}
            </h1>

            <h1 style={{ color: "white", textShadow: "0 0 10px rgba(255,255,255,0.8)" }}>
                Pantalla del Espectador
            </h1>

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
                    <img src={`http://localhost:3001/uploads/${presenter.photo}`} alt={presenter.name} width="120" />

                    <p style={{ fontSize: "24px", color: "white" }}>{presenter.name}</p>
                    <p style={{ color: "white" }}>Votos: {presenter.votes}</p>
                </div>
            )}

            {/* USUARIOS CONECTADOS */}
            <h2 style={{ color: "white", marginTop: "20px" }}>Usuarios conectados</h2>

            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "20px",
                    marginTop: "20px",
                }}
            >
                {users.map((user) => (
                    <div
                        key={user.id}
                        className="userCard"
                        style={{
                            width: "180px",
                            padding: "15px",
                            background: "rgba(255,255,255,0.15)",
                            borderRadius: "15px",
                            backdropFilter: "blur(10px)",
                            boxShadow: "0 0 15px rgba(255,255,255,0.3)",
                            textAlign: "center",
                            animation: "fadeIn 1s ease forwards",
                        }}
                    >
                        <img
                            src={`http://localhost:3001/uploads/${user.profilePhoto}`}
                            alt={user.name}
                            style={{
                                width: "100px",
                                height: "100px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                marginBottom: "10px",
                                boxShadow: "0 0 10px rgba(255,255,255,0.5)",
                            }}
                        />


                        <p style={{ color: "white", fontSize: "18px", fontWeight: "bold" }}>
                            {user.name} {user.lastname}
                        </p>
                    </div>
                ))}
            </div>

            {/* HORA ACTUAL + ESTIMADA ABAJO IZQUIERDA */}
            <div
                style={{
                    position: "absolute",
                    bottom: "50px",
                    left: "20px",
                    textAlign: "left",
                }}
            >
                <h2
                    style={{
                        color: "white",
                        fontSize: "22px",
                        margin: 0,
                        textShadow: "0 0 10px rgba(255,255,255,0.8)"
                    }}
                >
                    Hora actual: {currentTime.toLocaleTimeString()}
                </h2>

                {galaStartTime && (
                    <h3
                        style={{
                            color: "white",
                            fontSize: "18px",
                            marginTop: "5px",
                            textShadow: "0 0 10px rgba(255,255,255,0.8)"
                        }}
                    >
                        Inicio estimado: {galaStartTime.toLocaleTimeString()}
                    </h3>
                )}
            </div>
        </div>
    );
}
