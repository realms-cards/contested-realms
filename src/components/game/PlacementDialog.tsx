"use client";

import { useEffect, useRef } from "react";
import { RcButton } from "@/components/ui/rc-button";

interface PlacementDialogProps {
  cardName: string;
  pileName: string;
  onChoice: (position: "top" | "bottom") => void;
  onCancel: () => void;
}

export default function PlacementDialog({
  cardName,
  pileName,
  onChoice,
  onCancel,
}: PlacementDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.5)] backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] backdrop-blur shadow-rc-panel p-6 w-80 font-rc-sans text-rc-fg"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="text-center">
          <h3 className="mt-0 mb-2 font-rc-display text-[22px] leading-none text-rc-fg-strong">
            Place Card
          </h3>
          <p className="text-sm text-rc-fg-muted mb-6">
            Where should{" "}
            <span className="font-medium text-rc-fg-strong">
              &ldquo;{cardName}&rdquo;
            </span>{" "}
            be placed in the{" "}
            <span className="font-medium text-rc-fg-strong">{pileName}</span>?
          </p>

          <div className="flex gap-3">
            <RcButton
              className="h-auto flex-1 whitespace-normal px-4 py-2"
              onClick={() => onChoice("top")}
              autoFocus
            >
              Top of pile
            </RcButton>
            <RcButton
              variant="outline"
              className="h-auto flex-1 whitespace-normal px-4 py-2"
              onClick={() => onChoice("bottom")}
            >
              Bottom of pile
            </RcButton>
          </div>

          <button
            className="w-full mt-3 font-rc-sans text-xs text-rc-fg-muted transition-colors hover:text-rc-fg-strong"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
