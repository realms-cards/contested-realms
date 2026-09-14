"use client";

interface ValidationState {
  avatar: boolean;
  atlas: boolean;
  spellbook: boolean;
}

interface DeckValidationProps {
  avatarCount: number;
  atlasCount: number;
  spellbookCount: number;
  validation: ValidationState;
  minAtlas?: number;
  minSpellbook?: number;
  /** Magician: sites live in the spellbook, so they count toward its minimum */
  sitesInSpellbook?: boolean;
}

export default function DeckValidation({
  avatarCount,
  atlasCount,
  spellbookCount,
  validation,
  minAtlas,
  minSpellbook,
  sitesInSpellbook = false,
}: DeckValidationProps) {
  const atlasTarget = typeof minAtlas === "number" ? minAtlas : 12;
  const spellbookTarget = typeof minSpellbook === "number" ? minSpellbook : 24;
  const spellbookTotal = sitesInSpellbook
    ? spellbookCount + atlasCount
    : spellbookCount;

  return (
    <div className="flex items-center gap-6 text-sm tabular-nums">
      <div
        className={`flex items-center gap-2 transition-colors ${
          validation.avatar ? "text-rc-success" : "text-rc-danger"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            validation.avatar ? "bg-rc-success" : "bg-rc-danger"
          }`}
        />
        Avatar: {avatarCount} / 1
      </div>
      {sitesInSpellbook ? (
        // No atlas for this avatar — sites are shuffled into the spellbook
        <div
          className="flex items-center gap-2 text-rc-fg-muted"
          title="This avatar has no atlas: its sites go in the spellbook"
        >
          <div className="w-2 h-2 rounded-full bg-rc-fg-subtle" />
          Sites: {atlasCount} (in spellbook)
        </div>
      ) : (
        <div
          className={`flex items-center gap-2 transition-colors ${
            validation.atlas ? "text-rc-success" : "text-rc-danger"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              validation.atlas ? "bg-rc-success" : "bg-rc-danger"
            }`}
          />
          Atlas: {atlasCount} / {atlasTarget}+
        </div>
      )}
      <div
        className={`flex items-center gap-2 transition-colors ${
          validation.spellbook ? "text-rc-success" : "text-rc-danger"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            validation.spellbook ? "bg-rc-success" : "bg-rc-danger"
          }`}
        />
        Spellbook: {spellbookTotal} / {spellbookTarget}+
        {sitesInSpellbook ? " (incl. sites)" : ""}
      </div>
    </div>
  );
}

export type { ValidationState, DeckValidationProps };
