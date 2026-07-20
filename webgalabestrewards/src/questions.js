export const QUESTION_BANK = [
  { id: 1, gender: "all", text: "¿Quién es la persona más fiestera?" },
  { id: 2, gender: "all", text: "¿Quién es la persona más dramática?" },
  { id: 3, gender: "all", text: "¿Quién es la persona más despistada?" },
  { id: 4, gender: "all", text: "¿Quién es la persona que siempre llega tarde?" },
  { id: 5, gender: "all", text: "¿Quién es la persona más probable de perder el móvil?" },
  { id: 6, gender: "all", text: "¿Quién es la persona más probable de organizar un viaje de un día para otro?" },
  { id: 7, gender: "all", text: "¿Quién es la persona más probable de quedarse dormida en cualquier sitio?" },
  { id: 8, gender: "all", text: "¿Quién es la persona más probable de desaparecer del grupo durante horas y volver como si nada?" },
  { id: 9, gender: "all", text: "¿Quién es la persona más probable de olvidar un cumpleaños?" },
  { id: 10, gender: "all", text: "¿Quién es la persona más competitiva incluso jugando al parchís?" },
  { id: 11, gender: "all", text: "¿Quién es la persona más probable de sobrevivir sola en una isla?" },
  { id: 12, gender: "all", text: "¿Quién es la persona más probable de hacerse millonaria?" },
  { id: 13, gender: "all", text: "¿Quién es la persona más probable de acabar hablando una hora con un desconocido?" },
  { id: 14, gender: "all", text: "¿Quién es la persona más probable de perder un vuelo?" },
  { id: 15, gender: "all", text: "¿Quién es la persona más probable de responder un mensaje una semana después?" },
  { id: 16, gender: "all", text: "¿Quién es la persona más probable de gastarse todo el dinero en un fin de semana?" },
  { id: 17, gender: "all", text: "¿Quién es la persona más probable de quedarse sin batería antes de salir de casa?" },
  { id: 18, gender: "all", text: "¿Quién es la persona más probable de comprar algo que no necesitaba?" },
  { id: 19, gender: "all", text: "¿Quién es la persona más probable de hacerse influencer?" },
  { id: 20, gender: "all", text: "¿Quién es la persona más probable de reírse en el peor momento?" },
  { id: 21, gender: "all", text: "¿Quién es la persona más probable de decir 'voy en camino' sin haber salido de casa?" },
  { id: 22, gender: "all", text: "¿Quién es la persona más probable de enviar un mensaje al chat equivocado?" },
];

const normalizeText = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[¡!]/g, "")
    .replace(/[¿?]/g, "");

export const findDuplicateQuestion = (text) => {
  const normalized = normalizeText(text);
  return QUESTION_BANK.find(
    (q) => normalizeText(q.text) === normalized
  );
};

export const getQuestionsForGender = (gender) => {
  if (!gender) return QUESTION_BANK;
  return QUESTION_BANK.filter((q) => q.gender === "all" || q.gender === gender);
};

export const isSameQuestion = (textA, textB) => {
  if (!textA || !textB) return false;
  return normalizeText(textA) === normalizeText(textB);
};
