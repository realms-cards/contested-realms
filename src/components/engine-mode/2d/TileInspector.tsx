"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import CpuCardPick, { type CardPickItem } from "@/components/game/CpuCardPick";
import { RcButton } from "@/components/ui/rc-button";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useGameStore } from "@/lib/game/store";
import { inspectorItems, tileNumber } from "./picks2d";

/**
 * The 2D stand-in for the 3D fan-out (UnitPickSpread): when two or more candidate cards share a
 * tile too small to tap them apart, the tile opens this sheet and the same cards are chosen here,
 * large, by their art. Picking one selects its token exactly as tapping the card on the board
 * would, then closes the sheet. A tile that is itself a candidate offers that too, so opening the
 * inspector never hides a choice the tile had.
 */
export default function TileInspector({at,tokens,tileToken,onClose}: {
  at: string;
  /** The tile's clickable unit tokens, in drawing order. */
  tokens: readonly string[];
  /** The tile's own token when the tile is a candidate as well. */
  tileToken?: string | null;
  onClose: () => void;
}) {
  const permanents = useGameStore(state => state.permanents);
  const avatars = useGameStore(state => state.avatars);
  const selected = useCpuBoardPicker(picker => picker.selected);
  const items = inspectorItems(at,tokens,permanents,avatars);
  const tile = tileNumber(at);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown",onKey);
    return () => window.removeEventListener("keydown",onKey);
  },[onClose]);

  const pick = (token: string) => {
    useCpuBoardPicker.getState().select(token);
    onClose();
  };
  const rows: CardPickItem[] = items.map(item => {
    const whose = item.seat === "p1" ? "Yours" : "Opponent";
    const notes = [item.avatar ? `Avatar · ${whose}` : whose,item.tapped ? "Tapped" : "",item.faded ? "Other layer" : ""].filter(Boolean);
    return {id:item.token,card:item.card,badge:notes.join(" · ")};
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Tile ${tile}: choose a card`} data-engine-tile-inspector={at}
      className="pointer-events-auto fixed inset-0 z-[205] flex items-end justify-center bg-[rgba(6,10,20,0.7)] sm:items-center"
      onClick={onClose} onContextMenu={event => event.preventDefault()}>
      <div className="w-full max-w-lg px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] sm:pb-0" onClick={event => event.stopPropagation()}>
        <CpuCardPick title={`Tile ${tile} · choose a card`} items={rows} selected={selected} onPick={pick} onClose={onClose}>
          {tileToken && <div className="mt-3 flex justify-center">
            <RcButton variant="outline" size="sm" className="touch-manipulation" onClick={() => pick(tileToken)}>
              Choose tile {tile} itself
            </RcButton>
          </div>}
        </CpuCardPick>
      </div>
    </div>,
    document.body,
  );
}
