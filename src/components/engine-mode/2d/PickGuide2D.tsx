"use client";

import { useShallow } from "zustand/react/shallow";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";
import { PromptBanner } from "../EnginePromptShell";
import { pickGuide } from "./actions2d";

/** The main-phase picks' request prefix (useEngineInteraction); prompts and the mulligan have their own banners. */
const MAIN_PICK = "engine:";

type BoardState = Pick<ReturnType<typeof useGameStore.getState>, "zones" | "permanents" | "avatars" | "board">;

/**
 * The card a pick token stands for, looked up on the projected board: a hand card, a unit (an
 * avatar or a permanent) or the site on a tile. Null for anything else (an option, an arrow).
 */
export function pickTokenCard(token: string | null | undefined, state: BoardState): CardRef | null {
  if (!token) return null;
  if (token.startsWith("hand:")) {
    const rest = token.slice(5);
    const cut = rest.indexOf(":");
    const seat = rest.slice(0, cut) as "p1" | "p2";
    const id = rest.slice(cut + 1);
    return state.zones[seat]?.hand?.find((card) => card.instanceId === id) ?? null;
  }
  if (token.startsWith("unit:avatar:")) {
    const seat = token.slice(12) as "p1" | "p2";
    return state.avatars[seat]?.card ?? null;
  }
  if (token.startsWith("unit:perm:")) {
    const id = token.slice(10);
    for (const items of Object.values(state.permanents ?? {})) {
      const hit = items?.find((item) => item.instanceId === id || item.card?.instanceId === id);
      if (hit?.card) return hit.card;
    }
    return null;
  }
  if (/^\d+,\d+$/.test(token)) return state.board.sites[token]?.card ?? null;
  return null;
}

/** The card a half-made main-phase action started from (the first source the board lights), or null. */
export function useChosenSource(): CardRef | null {
  const { request, sequence, source } = useCpuBoardPicker(
    useShallow((p) => ({ request: p.request, sequence: p.sequence, source: p.sources[0] ?? null })),
  );
  const zones = useGameStore((s) => s.zones);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const board = useGameStore((s) => s.board);
  if (!request.startsWith(MAIN_PICK) || !sequence) return null;
  return pickTokenCard(source, { zones, permanents, avatars, board });
}

/**
 * The dock's heading while you are part-way through an action on the board: what is being
 * made ("Summon Sacred Scarabs", "Move Pit Vipers or attack") and what the board is waiting
 * for ("Tap a highlighted tile.", "Choose the surface or below it."). Without it a lit board
 * and a row of "On the surface" / "Burrowed" buttons sat under the preview unexplained.
 * Renders nothing until a first choice has been made (the lit board alone is the invitation).
 */
export default function PickGuide2D() {
  const { request, sequence, next, labels } = useCpuBoardPicker(
    useShallow((p) => ({ request: p.request, sequence: p.sequence, next: p.tiles, labels: p.labels })),
  );
  const source = useChosenSource();
  if (!request.startsWith(MAIN_PICK) || !sequence) return null;
  const guide = pickGuide({ next, labels, source: source?.name ?? null });
  if (!guide) return null;
  return <PromptBanner title={guide.title} hint={guide.ask} />;
}
