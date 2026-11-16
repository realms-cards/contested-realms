// "Bears" (Nanurluk) / "a Mortal or Bear" (Bearserker): Bear is no subtype, so — like Royalty ("any card
// with King, Queen… in its name", Codex) — it's read off the card NAME: a word starting "Bear" (Brown Bears,
// Polar Bears, Bearserker), never a word merely containing it (Overbearing Bailiff).
export const isBearName = (name: string) => /\bBear/.test(name)
