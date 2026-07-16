export const QUESTION_BANK = [
  { id: 1, gender: "chico", text: "¿Quién es el más chismoso?" },
  { id: 2, gender: "chica", text: "¿Quién es la más chismosa?" },
  { id: 3, gender: "chico", text: "¿Quién es el más ligón?" },
  { id: 4, gender: "chica", text: "¿Quién es la más ligona?" },
  { id: 5, gender: "chico", text: "¿Quién es el más fiestero?" },
  { id: 6, gender: "chica", text: "¿Quién es la más fiestera?" },
  { id: 7, gender: "chico", text: "¿Quién es el más dramático?" },
  { id: 8, gender: "chica", text: "¿Quién es la más dramática?" },
  { id: 9, gender: "chico", text: "¿Quién es el más despistado?" },
  { id: 10, gender: "chica", text: "¿Quién es la más despistada?" },
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

export const getQuestionsForGender = (gender) =>
  QUESTION_BANK.filter((q) => q.gender === gender);

export const isSameQuestion = (textA, textB) => {
  if (!textA || !textB) return false;
  return normalizeText(textA) === normalizeText(textB);
};
