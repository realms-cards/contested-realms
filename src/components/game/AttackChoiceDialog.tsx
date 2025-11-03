"use client";

import React from "react";
import { createPortal } from "react-dom";

type AttackChoiceDialogProps = {
  open: boolean;
  onChoose: (choice: "move" | "attack") => void;
  onClose: () => void;
  attackerName?: string | null;
  tileNumber?: number;
};

export default function AttackChoiceDialog({ open, onChoose, onClose, attackerName, tileNumber }: AttackChoiceDialogProps) {
  if (!open) return null;
  const node = (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 backdrop-blur-sm pointer-events-auto">
      <div className="w-[min(92vw,440px)] rounded-xl bg-zinc-900/95 text-white ring-1 ring-white/10 shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{attackerName ? `${attackerName}` : "After Move"}</h3>
          <button
            className="text-sm text-zinc-400 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {typeof tileNumber === "number" ? (
          <div className="text-xs text-zinc-400 mb-2">Tile #{tileNumber}</div>
        ) : null}
        <p className="text-sm text-zinc-300 mb-4">should:</p>
        <div className="grid gap-2">
          <button
            className="h-10 rounded bg-emerald-600/90 hover:bg-emerald-500 text-sm"
            onClick={() => onChoose("attack")}
          >
            Move & Attack
          </button>
          <button
            className="h-10 rounded bg-white/15 hover:bg-white/25 text-sm"
            onClick={() => onChoose("move")}
          >
            Move Only
          </button>
        </div>
      </div>
    </div>
  );
  if (typeof document !== "undefined") return createPortal(node, document.body);
  return node;
}
