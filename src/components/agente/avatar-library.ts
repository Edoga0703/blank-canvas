export interface AvatarTraits {
  gender: "masculino" | "feminino";
  skinTone: string;
  hair: string;
  accessories: string[];
  clothingColor: string;
}

export const SKIN_TONES = [
  { label: "Clara", color: "#FAD6BD" },
  { label: "Clara média", color: "#E7A87E" },
  { label: "Média", color: "#D29168" },
  { label: "Morena", color: "#8D5524" },
  { label: "Escura", color: "#4B2C1A" },
];

export const HAIR_STYLES = [
  { id: "curto", label: "Curto" },
  { id: "cacheado", label: "Cacheado" },
  { id: "crespo", label: "Crespo" },
  { id: "ondulado", label: "Ondulado" },
  { id: "executivo", label: "Executivo" },
  { id: "despojado", label: "Despojado" },
  { id: "careca", label: "Sem cabelo" },
];


export const CLOTHING_COLORS = [
  { label: "Azul", color: "#0B22FE" },
  { label: "Verde", color: "#10B981" },
  { label: "Laranja", color: "#F97316" },
  { label: "Cinza", color: "#64748B" },
];

export interface LibraryAvatar {
  id: string;
  name: string;
  traits: AvatarTraits;
}

export const AVATAR_LIBRARY: LibraryAvatar[] = [
  {
    id: "rafa",
    name: "Rafa",
    traits: { gender: "masculino", skinTone: "#E7A87E", hair: "curto", accessories: ["oculos", "barba"], clothingColor: "#0B22FE" },
  },
  {
    id: "caio",
    name: "Caio",
    traits: { gender: "masculino", skinTone: "#4B2C1A", hair: "crespo", accessories: ["barba"], clothingColor: "#0B22FE" },
  },
  {
    id: "lia",
    name: "Lia",
    traits: { gender: "feminino", skinTone: "#D29168", hair: "ondulado", accessories: [], clothingColor: "#F97316" },
  },
  {
    id: "bia",
    name: "Bia",
    traits: { gender: "feminino", skinTone: "#4B2C1A", hair: "cacheado", accessories: [], clothingColor: "#10B981" },
  },
  {
    id: "paulo",
    name: "Paulo",
    traits: { gender: "masculino", skinTone: "#FAD6BD", hair: "ondulado", accessories: ["oculos", "barba"], clothingColor: "#64748B" },
  },
  {
    id: "bruno",
    name: "Bruno",
    traits: { gender: "masculino", skinTone: "#D29168", hair: "careca", accessories: ["barba"], clothingColor: "#0B22FE" },
  },
];

