export type SleevePreset = {
  id: string;
  label: string;
  description: string;
  color: string;
  metalness: number;
  roughness: number;
};

export const SLEEVE_PRESETS: SleevePreset[] = [
  {
    id: "preset:metal-gold",
    label: "Metal Gold",
    description: "Radiant gold foil",
    color: "#d4af37",
    metalness: 0.95,
    roughness: 0.15,
  },
  {
    id: "preset:metal-silver",
    label: "Metal Silver",
    description: "Polished silver",
    color: "#c0c0c0",
    metalness: 0.9,
    roughness: 0.2,
  },
  {
    id: "preset:deep-red",
    label: "Deep Red",
    description: "Velvet crimson matte",
    color: "#7b1e20",
    metalness: 0.2,
    roughness: 0.6,
  },
  {
    id: "preset:brown",
    label: "Leather Brown",
    description: "Weathered leather",
    color: "#5a381e",
    metalness: 0.1,
    roughness: 0.7,
  },
  {
    id: "preset:ivory",
    label: "Ivory",
    description: "Ivory parchment",
    color: "#f2e6c9",
    metalness: 0.05,
    roughness: 0.5,
  },
  {
    id: "preset:deep-blue",
    label: "Deep Blue",
    description: "Sapphire sheen",
    color: "#0b2e6b",
    metalness: 0.3,
    roughness: 0.45,
  },
  {
    id: "preset:emerald",
    label: "Emerald Green",
    description: "Polished emerald",
    color: "#0f6b43",
    metalness: 0.35,
    roughness: 0.4,
  },
  {
    id: "preset:bright-yellow",
    label: "Bright Yellow",
    description: "Sunburst gloss",
    color: "#f5d142",
    metalness: 0.25,
    roughness: 0.35,
  },
];

export function isSleevePreset(id: unknown): id is SleevePreset["id"] {
  if (typeof id !== "string") return false;
  return SLEEVE_PRESETS.some((preset) => preset.id === id);
}
