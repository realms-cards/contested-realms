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
}

export default function DeckValidation({
  avatarCount,
  atlasCount,
  spellbookCount,
  validation,
  minAtlas,
  minSpellbook,
}: DeckValidationProps) {
  const atlasTarget = typeof minAtlas === "number" ? minAtlas : 12;
  const spellbookTarget = typeof minSpellbook === "number" ? minSpellbook : 24;

  return (
    <div className="flex items-center gap-6 text-sm">
      <div
        className={`flex items-center gap-2 transition-colors ${
          validation.avatar ? "text-green-400" : "text-red-400"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            validation.avatar ? "bg-green-400" : "bg-red-400"
          }`}
        />
        Avatar: {avatarCount} / 1
      </div>
      <div
        className={`flex items-center gap-2 transition-colors ${
          validation.atlas ? "text-green-400" : "text-red-400"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            validation.atlas ? "bg-green-400" : "bg-red-400"
          }`}
        />
        Atlas: {atlasCount} / {atlasTarget}+
      </div>
      <div
        className={`flex items-center gap-2 transition-colors ${
          validation.spellbook ? "text-green-400" : "text-red-400"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            validation.spellbook ? "bg-green-400" : "bg-red-400"
          }`}
        />
        Spellbook: {spellbookCount} / {spellbookTarget}+
      </div>
    </div>
  );
}

export type { ValidationState, DeckValidationProps };
