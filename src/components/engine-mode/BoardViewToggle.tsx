"use client";

import { RcButton } from "@/components/ui/rc-button";
import { useGraphicsSettings, type BoardViewPreference } from "@/hooks/useGraphicsSettings";

const OPTIONS: ReadonlyArray<{ value: BoardViewPreference; label: string; title: string }> = [
  { value: "auto", label: "Auto", title: "Flat board on phones, 3D table elsewhere" },
  { value: "3d", label: "3D", title: "Always the 3D table" },
  { value: "2d", label: "2D", title: "Always the flat board" },
];

/**
 * The Auto / 3D / 2D board choice for in-match menus — the same setting as the Board View row
 * in the settings panel, so either place changes both. Switching swaps the board in place.
 *
 * `compact` drops the field label for tight spots such as the 2D view's More sheet.
 */
export default function BoardViewToggle({ compact = false }: { compact?: boolean }) {
  const { settings, setBoardView } = useGraphicsSettings();
  const current = settings.boardView ?? "auto";
  return (
    <div>
      {!compact && <div className="rc-field-label mb-1.5">Board view</div>}
      <div role="group" aria-label="Board view" className="flex gap-1">
        {OPTIONS.map((option) => (
          <RcButton
            key={option.value}
            variant="outline"
            size="xs"
            tone="info"
            title={option.title}
            aria-pressed={current === option.value}
            onClick={() => setBoardView(option.value)}
            className="flex-1 font-rc-mono"
          >
            {option.label}
          </RcButton>
        ))}
      </div>
    </div>
  );
}
