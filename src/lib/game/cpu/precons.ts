import betaDecks from "../../../../data/precons/beta.json";
import fvlDecks from "../../../../data/precons/fvl.json";

/** A bundled precon list (data/precons/*.json); the avatar travels outside the spellbook. */
export interface PreconDeck {
  id: string;
  name: string;
  avatar: string;
  spellbook: { name: string; count: number }[];
  atlas: { name: string; count: number }[];
  collection?: { name: string; count: number }[];
  /** Set whose printings the deck shows, when not Beta */
  set?: string;
  /** Counts not yet confirmed officially */
  provisional?: boolean;
}

export const betaPrecons: PreconDeck[] = betaDecks;

/** Frost Mage Vs. Lavamancer (provisional counts until the official lists are published) */
export const fvlPrecons: PreconDeck[] = fvlDecks;

/**
 * Every bundled precon, for vs-CPU play and /api/precons. Engine mode keeps to betaPrecons:
 * the vendored rules engine does not know every FvL card yet.
 */
export const cpuPrecons: PreconDeck[] = [...betaPrecons, ...fvlPrecons];
