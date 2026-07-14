import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { useState } from "react";
import Join from "./pages/Join";
import Spectator from "./pages/Spectator";
import Admin from "./pages/Admin";
import Voter from "./pages/Voter";

// 🔐 Contraseña global
const PASSWORD = "FUERTEVENTURA2026";

// 🔐 Componente de protección
function ProtectedRoute({ children }) {
  const isAuth = sessionStorage.getItem("auth") === "true";
  return isAuth ? children : <h1 style={{ textAlign: "center" }}>Acceso denegado</h1>;
}

// 🔐 Pantalla de contraseña
function PasswordScreen() {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submitPassword = () => {
    if (password === PASSWORD) {
      sessionStorage.setItem("auth", "true");
      navigate("/home");
    } else {
      alert("Contraseña incorrecta");
    }
  };

  return (
    <div
      style={{
        padding: "40px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        overflowY: "hidden",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #3f1dcb, #1a73e8, #ffffff, #ff66cc)",
      }}
    >
      <style>
        {`
    html, body {
      overflow: hidden;
      height: 100%;
    }
  `}
      </style>

      {/* CÍRCULOS ANIMADOS */}
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

      <div
        style={{
          position: "absolute",
          top: "60%",
          left: "70%",
          width: "200px",
          height: "200px",
          background: "rgba(138,43,226,0.35)",
          borderRadius: "50%",
          animation: "float2 8s infinite ease-in-out",
          filter: "blur(6px)",
        }}
      ></div>

      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          width: "120px",
          height: "120px",
          background: "rgba(0,150,255,0.30)",
          borderRadius: "50%",
          animation: "float3 10s infinite ease-in-out",
          filter: "blur(5px)",
        }}
      ></div>

      <style>
        {`
      @keyframes float1 {
        0% { transform: translateY(0px) translateX(0px); }
        50% { transform: translateY(-40px) translateX(20px); }
        100% { transform: translateY(0px) translateX(0px); }
      }

      @keyframes float2 {
        0% { transform: translateY(0px) translateX(0px); }
        50% { transform: translateY(50px) translateX(-30px); }
        100% { transform: translateY(0px) translateX(0px); }
      }

      @keyframes float3 {
        0% { transform: translateY(0px) translateX(0px); }
        50% { transform: translateY(-30px) translateX(-20px); }
        100% { transform: translateY(0px) translateX(0px); }
      }
    `}
      </style>

      {/* ⭐ TU BLOQUE EXACTO, SIN CAMBIAR NADA ⭐ */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{ color: "gold", fontSize: "35px" }}>BEST REWARDS FUERTEVENTURA 2026</h1>
        <h3>Introduce la contraseña para acceder</h3>

        <input
          type="password"
          placeholder="Introduce la contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "90%",
            padding: "15px",
            fontSize: "20px",
            marginTop: "25px",
            borderRadius: "15px",
            border: "none",
            outline: "none",
            background: "rgba(255,255,255,0.2)",
            color: "black",
            boxShadow: "0 0 10px rgba(255,255,255,0.4)",
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
          }}
          onFocus={(e) => {
            e.target.style.boxShadow = "0 0 20px gold";
            e.target.style.background = "rgba(255,255,255,0.3)";
          }}
          onBlur={(e) => {
            e.target.style.boxShadow = "0 0 10px rgba(255,255,255,0.4)";
            e.target.style.background = "rgba(255,255,255,0.2)";
          }}
        />

        <button
          onClick={submitPassword}
          style={{
            padding: "15px 40px",
            fontSize: "22px",
            marginTop: "30px",
            borderRadius: "20px",
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg, gold, #ffdd55)",
            color: "#000000",
            fontWeight: "bold",
            boxShadow: "0 0 20px gold",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = "scale(1.05)";
            e.target.style.boxShadow = "0 0 30px gold";
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "scale(1)";
            e.target.style.boxShadow = "0 0 20px gold";
          }}
        >
          Entrar
        </button>

      </div>
    </div>

  );
}

// ⭐ Pantalla con los 3 botones (solo aparece después de contraseña)
function Home() {
  const navigate = useNavigate();

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
      {/* Luces de escenario */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "-10%",
          width: "300px",
          height: "300px",
          background: "rgba(255,255,255,0.15)",
          transform: "rotate(45deg)",
          filter: "blur(40px)",
          animation: "lightMove1 6s infinite linear",
        }}
      ></div>

      <div
        style={{
          position: "absolute",
          top: "-20%",
          right: "-10%",
          width: "300px",
          height: "300px",
          background: "rgba(255,255,255,0.15)",
          transform: "rotate(-45deg)",
          filter: "blur(40px)",
          animation: "lightMove2 6s infinite linear",
        }}
      ></div>

      {/* Círculos animados */}
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
      <style>
{`
  @keyframes pulseGlow {
    0% { box-shadow: 0 0 20px rgba(255,255,255,0.4); }
    50% { box-shadow: 0 0 35px rgba(255,255,255,0.9); }
    100% { box-shadow: 0 0 20px rgba(255,255,255,0.4); }
  }

  @keyframes breathe {
    0% { transform: scale(1); }
    50% { transform: scale(1.03); }
    100% { transform: scale(1); }
  }

  @keyframes popIn {
    0% { opacity: 0; transform: scale(0.6); }
    60% { opacity: 1; transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`}
</style>


      <h1
        style={{
          color: "white",
          textShadow: "0 0 10px white",
          fontSize: "45px",
          animation: "fadeIn 1s ease",
        }}
      >
        Selecciona tu modo
      </h1>

      <div
  style={{
    display: "flex",
    flexDirection: "row",
    gap: "45px",
    marginTop: "40px",
    justifyContent: "center",
    alignItems: "center",
  }}
>
  {/* BOTÓN ANIMADO */}
  <button
    onClick={() => navigate("/spectator")}
    style={{
      padding: "35px",
      fontSize: "26px",
      borderRadius: "22px",
      border: "none",
      cursor: "pointer",
      background: "linear-gradient(135deg, #ffffff, #e8e8e8)",
      color: "#3f1dcb",
      fontWeight: "bold",
      width: "230px",
      height: "230px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",

      animation: "pulseGlow 3s infinite ease-in-out, breathe 4s infinite ease-in-out, popIn 0.6s ease",
      transition: "all 0.3s ease",
    }}
    onMouseEnter={(e) => {
      e.target.style.transform = "scale(1.12)";
      e.target.style.boxShadow = "0 0 45px gold";
      e.target.style.background = "linear-gradient(135deg, gold, #ffdd55)";
    }}
    onMouseLeave={(e) => {
      e.target.style.transform = "scale(1)";
      e.target.style.boxShadow = "0 0 25px rgba(255,255,255,0.7)";
      e.target.style.background = "linear-gradient(135deg, #ffffff, #e8e8e8)";
    }}
  >
    PANTALLA<br />PRINCIPAL
  </button>

  <button
    onClick={() => navigate("/voter")}
    style={{
      padding: "35px",
      fontSize: "26px",
      borderRadius: "22px",
      border: "none",
      cursor: "pointer",
      background: "linear-gradient(135deg, #ffffff, #e8e8e8)",
      color: "#3f1dcb",
      fontWeight: "bold",
      width: "230px",
      height: "230px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",

      animation: "pulseGlow 3s infinite ease-in-out, breathe 4s infinite ease-in-out, popIn 0.8s ease",
      transition: "all 0.3s ease",
    }}
    onMouseEnter={(e) => {
      e.target.style.transform = "scale(1.12)";
      e.target.style.boxShadow = "0 0 45px gold";
      e.target.style.background = "linear-gradient(135deg, gold, #ffdd55)";
    }}
    onMouseLeave={(e) => {
      e.target.style.transform = "scale(1)";
      e.target.style.boxShadow = "0 0 25px rgba(255,255,255,0.7)";
      e.target.style.background = "linear-gradient(135deg, #ffffff, #e8e8e8)";
    }}
  >
    VOTANTE
  </button>

  <button
    onClick={() => navigate("/admin")}
    style={{
      padding: "35px",
      fontSize: "26px",
      borderRadius: "22px",
      border: "none",
      cursor: "pointer",
      background: "linear-gradient(135deg, #ffffff, #e8e8e8)",
      color: "#3f1dcb",
      fontWeight: "bold",
      width: "230px",
      height: "230px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",

      animation: "pulseGlow 3s infinite ease-in-out, breathe 4s infinite ease-in-out, popIn 1s ease",
      transition: "all 0.3s ease",
    }}
    onMouseEnter={(e) => {
      e.target.style.transform = "scale(1.12)";
      e.target.style.boxShadow = "0 0 45px gold";
      e.target.style.background = "linear-gradient(135deg, gold, #ffdd55)";
    }}
    onMouseLeave={(e) => {
      e.target.style.transform = "scale(1)";
      e.target.style.boxShadow = "0 0 25px rgba(255,255,255,0.7)";
      e.target.style.background = "linear-gradient(135deg, #ffffff, #e8e8e8)";
    }}
  >
    ADMIN
  </button>
</div>


    </div>
  );
}


function App() {
  return (
    <Router>
      <Routes>
        {/* Pantalla de contraseña */}
        <Route path="/" element={<PasswordScreen />} />

        {/* Pantalla con botones (protegida) */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        {/* Rutas protegidas */}
        <Route
          path="/spectator"
          element={
            <ProtectedRoute>
              <Spectator />
            </ProtectedRoute>
          }
        />

        <Route
          path="/voter"
          element={
            <ProtectedRoute>
              <Voter />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />

        {/* Join NO está protegido porque es para votantes externos */}
        <Route path="/join" element={<Join />} />
      </Routes>
    </Router>
  );
}

export default App;
