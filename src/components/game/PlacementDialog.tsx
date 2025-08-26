"use client";

import { useEffect, useRef } from "react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="bg-zinc-900/95 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-2xl p-6 w-80 text-white"
      >
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Place Card</h3>
          <p className="text-sm text-zinc-300 mb-6">
            Where should <span className="font-medium text-white">&ldquo;{cardName}&rdquo;</span> be placed in the{" "}
            <span className="font-medium text-white">{pileName}</span>?
          </p>
          
          <div className="flex gap-3">
            <button
              className="flex-1 bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              onClick={() => onChoice("top")}
              autoFocus
            >
              Top of pile
            </button>
            <button
              className="flex-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              onClick={() => onChoice("bottom")}
            >
              Bottom of pile
            </button>
          </div>
          
          <button
            className="w-full mt-3 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
