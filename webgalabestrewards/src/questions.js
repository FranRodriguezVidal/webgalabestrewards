export const QUESTION_BANK = [
  { id: 1, gender: "all", text: "¿Quién es la persona más chismosa?" },
  { id: 2, gender: "all", text: "¿Quién es la persona más ligona?" },
  { id: 3, gender: "all", text: "¿Quién es la persona más fiestera?" },
  { id: 4, gender: "all", text: "¿Quién es la persona más dramática?" },
  { id: 5, gender: "all", text: "¿Quién es la persona más despistada?" },
  { id: 6, gender: "all", text: "¿Quién tiene la mejor sonrisa?" },
  { id: 7, gender: "all", text: "¿Quién sería mejor presentador o presentadora?" },
  { id: 8, gender: "all", text: "¿Quién tiene más estilo?" },
  { id: 9, gender: "all", text: "¿Quién siempre anima al grupo?" },
  { id: 10, gender: "all", text: "¿Quién se merece un aplauso extra hoy?" },
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
