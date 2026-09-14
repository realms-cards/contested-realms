"use client";

import { Icon } from "@iconify/react";
import { useEffect } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.5)] pointer-events-auto"
      onClick={onCancel}
    >
      <div
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-4 font-rc-sans text-rc-fg shadow-rc-panel max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 font-rc-display text-[18px] leading-tight text-rc-fg-strong">
          Attach {artifactName} to:
        </div>
        <div className="thin-scrollbar space-y-2 max-h-96 overflow-y-auto">
          {targets.map((target, idx) => (
            <button
              key={`${target.type}-${target.index}-${idx}`}
              onClick={() => onSelect(target)}
              className="w-full text-left px-3 py-2 rounded-rc-md border border-rc-line/12 bg-black/30 transition-colors hover:border-rc-accent/35 hover:bg-rc-accent/8"
            >
              <div className="font-rc-display text-[15px] leading-tight text-rc-fg-strong">
                {target.type === "avatar" && (
                  <Icon
                    icon="game-icons:shield"
                    width={14}
                    height={14}
                    className="mr-1 inline-block align-[-2px] text-rc-accent-link"
                  />
                )}
                {target.displayName}
              </div>
              <div className="mt-0.5 font-rc-sans text-xs text-rc-fg-subtle">
                {target.card.type || "Unknown type"}
                {target.card.subTypes ? ` - ${target.card.subTypes}` : ""}
              </div>
            </button>
          ))}
        </div>
        <RcButton
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="mt-3 w-full"
        >
          Cancel
        </RcButton>
      </div>
    </div>
  );
}
