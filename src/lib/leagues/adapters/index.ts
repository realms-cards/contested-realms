/**
 * League Adapter Registry
 *
 * Maps league slugs to their specific API adapters.
 * Add new adapters here as new leagues are integrated.
 */

import type { LeagueAdapter } from "@/lib/leagues/reporter";
import { sorcerersSummitAdapter } from "./sorcerers-summit";

const adapters: Record<string, LeagueAdapter> = {
  "sorcerers-summit": sorcerersSummitAdapter,
};

export function getLeagueAdapter(slug: string): LeagueAdapter | null {
  return adapters[slug] || null;
}
