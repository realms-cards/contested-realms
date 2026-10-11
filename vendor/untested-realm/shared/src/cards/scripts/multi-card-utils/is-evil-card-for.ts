import { isEvilCardNameFor } from '../../../engine/statics'

// "Evil" for a not-in-realm card OWNED by `player`, honoring that player's identity overrides
// (Corruptor: your Beasts are Monsters, Mortals Undead, Angels Demons) and Saint of Redemption.
// Alias of the canonical engine helper — kept so existing card scripts import it from here.
export const isEvilCardFor = isEvilCardNameFor
