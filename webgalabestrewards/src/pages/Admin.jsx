import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";

export default function Admin() {
  const [categories, setCategories] = useState([]);
  const [galaState, setGalaState] = useState(null);

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

  // Cargar estado global de la gala
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "galaState", "state"), (snapshot) => {
      setGalaState(snapshot.data());
    });

    return () => unsubscribe();
  }, []);

  // Cambiar categoría activa
  const setCategory = async (categoryId) => {
    await updateDoc(doc(db, "galaState", "state"), {
      currentCategory: categoryId,
      stage: "waiting",
      showPresenter: false
    });
  };

  // Abrir votaciones
  const openVoting = async () => {
    await updateDoc(doc(db, "galaState", "state"), {
      stage: "voting",
      showPresenter: false
    });
  };

  // Cerrar votaciones
  const closeVoting = async () => {
    await updateDoc(doc(db, "galaState", "state"), {
      stage: "results"
    });
  };

  // Mostrar presentador (menos votado)
  const showPresenter = async () => {
    await updateDoc(doc(db, "galaState", "state"), {
      showPresenter: true
    });
  };

  if (!galaState) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Panel de Admin</h1>

      <h2>Categoría activa: {galaState.currentCategory}</h2>
      <h3>Etapa: {galaState.stage}</h3>

      <h2>Seleccionar categoría</h2>
      {categories.map((cat) => (
        <button key={cat.id} onClick={() => setCategory(cat.id)}>
          {cat.name}
        </button>
      ))}

      <hr />

      <h2>Control de votaciones</h2>
      <button onClick={openVoting}>Abrir votaciones</button>
      <button onClick={closeVoting}>Cerrar votaciones</button>

      <hr />

      <h2>Presentador</h2>
      <button onClick={showPresenter}>Mostrar presentador (menos votado)</button>
    </div>
  );
}
