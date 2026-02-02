"use client";

import { useEffect } from "react";
import type { CardRef } from "@/lib/game/store";

export interface AttachmentTarget {
  type: "permanent" | "avatar";
  index: number; // -1 for avatar
  card: CardRef;
  displayName: string;
  avatarKey?: "p1" | "p2"; // Which avatar (for avatar targets)
}

interface AttachmentTargetSelectionDialogProps {
  artifactName: string;
  targets: AttachmentTarget[];
  onSelect: (target: AttachmentTarget) => void;
  onCancel: () => void;
}

export default function AttachmentTargetSelectionDialog({
  artifactName,
  targets,
  onSelect,
  onCancel,
}: AttachmentTargetSelectionDialogProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-auto"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-white/20 rounded-lg p-4 shadow-xl max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium mb-3">
          Attach {artifactName} to:
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {targets.map((target, idx) => (
            <button
              key={`${target.type}-${target.index}-${idx}`}
              onClick={() => onSelect(target)}
              className="w-full text-left px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded border border-white/10 hover:border-white/30 transition-colors"
            >
              <div className="font-medium text-sm">
                {target.type === "avatar" && "🛡️ "}
                {target.displayName}
              </div>
              <div className="text-xs text-white/60 mt-0.5">
                {target.card.type || "Unknown type"}
                {target.card.subTypes ? ` - ${target.card.subTypes}` : ""}
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-3 w-full px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
