"use client";

import { DeckValidation } from "@/components/deck-editor";

type DeckPanelsProps = {
  // Modes
  isDraftMode: boolean;
  isSealed: boolean;
  // Auth
  status: "authenticated" | "unauthenticated" | "loading";
  // Deck list/selection
  decks: Array<{ id: string; name: string; format: string }>;
  deckId: string | null;
  deckName: string;
  loadingDecks: boolean;
  // Sorting
  pick3DLength: number;
  isSortingEnabled: boolean;
  onToggleSort: () => void;
  onForceSort: () => void;
  // Validation
  avatarCount: number;
  atlasCount: number;
  spellbookNonAvatar: number;
  validation: { avatar: boolean; atlas: boolean; spellbook: boolean };
  saving: boolean;
  // Handlers
  onLoadDeck: (id: string) => void;
  onClearEditor: () => void;
  onSetDeckName: (name: string) => void;
  onSaveDeck: () => void;
  onSubmitSealed: () => void;
  onSubmitDraft: () => void;
};

export default function DeckPanels(props: DeckPanelsProps) {
  const {
    isDraftMode,
    isSealed,
    status,
    decks,
    deckId,
    deckName,
    loadingDecks,
    pick3DLength,
    isSortingEnabled,
    onToggleSort,
    onForceSort,
    avatarCount,
    atlasCount,
    spellbookNonAvatar,
    validation,
    saving,
    onLoadDeck,
    onClearEditor,
    onSetDeckName,
    onSaveDeck,
    onSubmitSealed,
    onSubmitDraft,
  } = props;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none">
        <div className="text-3xl font-fantaisie text-white">
          Deck Editor
          {isDraftMode && (
            <span className="text-lg text-orange-400 ml-2">(Draft Completion Mode)</span>
          )}
        </div>

        {/* Deck selector - hidden in sealed/draft modes */}
        {!isSealed && !isDraftMode && (
          <div className="flex items-center gap-3">
            <select
              value={deckId || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onLoadDeck(v);
                else onClearEditor();
              }}
              disabled={loadingDecks || status !== "authenticated"}
              className="border rounded px-3 py-2 bg-black/70 text-white border-white/30 min-w-48 disabled:opacity-60"
            >
              <option value="">— New Deck —</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} • {d.format}
                </option>
              ))}
            </select>

            <input
              value={deckName}
              onChange={(e) => onSetDeckName(e.target.value)}
              className="border rounded px-3 py-2 bg-black/70 text-white border-white/30"
              placeholder="Deck name"
            />
            <button
              onClick={isSealed ? onSubmitSealed : isDraftMode ? onSubmitDraft : onSaveDeck}
              disabled={
                saving || status !== "authenticated" ||
                (isDraftMode && (!validation.avatar || !validation.atlas || !validation.spellbook))
              }
              className={`h-10 px-4 rounded text-white disabled:opacity-50 ${
                isSealed ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
              }`}
              title={
                status !== "authenticated"
                  ? "Sign in to save or submit decks"
                  : isDraftMode && (!validation.avatar || !validation.atlas || !validation.spellbook)
                  ? "Cannot save invalid deck in draft mode"
                  : isSealed
                  ? "Submit sealed deck to match"
                  : undefined
              }
            >
              {saving ? "Submitting..." : isSealed ? "Submit Sealed Deck" : deckId ? "Update Deck" : "Save Deck"}
            </button>
          </div>
        )}

        {/* Auth callout: gate save/load, keep Canvas alive */}
        {status !== "authenticated" && (
          <div className="ml-auto flex items-center gap-3 px-3 py-2 rounded bg-yellow-500/15 text-yellow-200 border border-yellow-500/30">
            <span className="text-sm">Sign in to save or load decks</span>
            <a
              href="/auth/signin?callbackUrl=%2Fdecks%2Feditor-3d"
              className="h-8 px-3 rounded bg-yellow-500/30 hover:bg-yellow-500/40 text-yellow-100 text-sm inline-flex items-center"
            >
              Sign In
            </a>
          </div>
        )}

        {/* Sorting controls */}
        {pick3DLength > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleSort}
              className={`h-10 px-4 rounded font-medium transition-colors ${
                isSortingEnabled ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isSortingEnabled ? "Unsort Cards" : "Sort Cards"}
            </button>
            {isSortingEnabled && (
              <button
                onClick={onForceSort}
                className="h-10 px-4 rounded bg-blue-600 text-white hover:bg-blue-500 font-medium"
                title="Re-apply sorting to all cards"
              >
                Re-sort
              </button>
            )}
          </div>
        )}

        {/* Validation status and submit actions */}
        <div className="ml-auto flex items-center gap-3">
          <DeckValidation
            avatarCount={avatarCount}
            atlasCount={atlasCount}
            spellbookCount={spellbookNonAvatar}
            validation={validation}
            isDraftMode={isDraftMode}
          />
          {isSealed && (
            <button
              onClick={onSubmitSealed}
              disabled={
                saving || status !== "authenticated" ||
                (isDraftMode && (!validation.avatar || !validation.atlas || !validation.spellbook))
              }
              className="h-10 px-4 rounded text-white disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
              title={
                isDraftMode && (!validation.avatar || !validation.atlas || !validation.spellbook)
                  ? "Cannot save invalid deck in draft mode"
                  : "Submit sealed deck to match"
              }
            >
              {saving ? "Submitting..." : "Submit Sealed Deck"}
            </button>
          )}
          {isDraftMode && (
            <button
              onClick={onSubmitDraft}
              disabled={
                saving || status !== "authenticated" ||
                !validation.avatar || !validation.atlas || !validation.spellbook
              }
              className="h-10 px-4 rounded text-white disabled:opacity-50 bg-purple-600 hover:bg-purple-700"
              title={
                !validation.avatar || !validation.atlas || !validation.spellbook
                  ? "Cannot submit invalid deck in draft mode"
                  : "Submit draft deck to match"
              }
            >
              {saving ? "Submitting..." : "Submit Draft Deck"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

