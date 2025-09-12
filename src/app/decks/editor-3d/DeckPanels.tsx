"use client";

import { useState } from "react";
import DeckTopBarActions from "@/app/decks/editor-3d/DeckTopBarActions";
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
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
      <div className="max-w-7xl mx-auto p-4 lg:pr-[20rem] xl:pr-[24rem] 2xl:pr-[28rem] flex flex-wrap items-end gap-4 pointer-events-auto select-none">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-fantaisie text-white">
            Deck Editor
            {isDraftMode && (
              <span className="text-lg text-orange-400 ml-2">(Draft Completion Mode)</span>
            )}
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
            title="How to use the editor"
            aria-label="How to use the editor"
          >
            {/* Question mark icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 15h2v2h-2v-2zm3.07-7.75c-.9-.9-2.24-1.17-3.43-.74-1.19.44-2.02 1.51-2.17 2.77l1.99.23c.09-.68.54-1.25 1.18-1.49.64-.24 1.36-.08 1.84.4.62.62.62 1.63 0 2.25-.37.37-.81.67-1.21.98-.77.6-1.27 1.15-1.27 2.35V13h2c0-.53.2-.74.82-1.21.45-.35.98-.74 1.46-1.22 1.24-1.24 1.24-3.26-.21-4.32z"/>
            </svg>
          </button>
          {pick3DLength > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleSort}
                title={isSortingEnabled ? "Disable auto-stacking" : "Enable auto-stacking"}
                aria-label={isSortingEnabled ? "Disable auto-stacking" : "Enable auto-stacking"}
                className={`h-9 w-9 rounded-full grid place-items-center ring-1 transition ${
                  isSortingEnabled
                    ? "bg-emerald-500 text-black ring-emerald-400 hover:bg-emerald-400"
                    : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
                }`}
              >
                {/* Shuffle/stack icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3 7h3.586a2 2 0 0 1 1.414.586l6.828 6.828A2 2 0 0 0 16.242 15H21v2h-4.758a4 4 0 0 1-2.829-1.172L6.586 9.414A2 2 0 0 0 5.172 9H3V7zm0 10h5l2 2H3v-2zm18-8h-5l-2-2H21v2z"/>
                </svg>
              </button>
              <button
                onClick={onForceSort}
                title="Re-apply stacking"
                aria-label="Re-apply stacking"
                className="h-9 w-9 rounded-full grid place-items-center ring-1 ring-blue-400 bg-blue-600 text-white hover:bg-blue-500"
              >
                {/* Refresh icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 6V3L8 7l4 4V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-6z"/>
                </svg>
              </button>
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => setControlsOpen((v) => !v)}
              className={`h-9 w-9 grid place-items-center rounded-full ${
                controlsOpen ? "bg-white/20" : "bg-white/10 hover:bg-white/20"
              } text-white/80 hover:text-white`}
              title={controlsOpen ? "Hide deck controls" : "Show deck controls"}
              aria-label={controlsOpen ? "Hide deck controls" : "Show deck controls"}
            >
              {/* Sliders icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M4 6h8v2H4V6zm12 0h4v2h-4V6zM9 11h11v2H9v-2zM4 11h3v2H4v-2zm0 5h8v2H4v-2zm12 0h4v2h-4v-2z"/>
              </svg>
            </button>
            {controlsOpen && (
              <div className="absolute top-full left-0 mt-2 z-[60] pointer-events-auto">
                <div className="rounded-lg bg-black/85 ring-1 ring-white/20 p-3 shadow-xl">
                  <DeckTopBarActions
                    isSealed={isSealed}
                    isDraftMode={isDraftMode}
                    status={status}
                    decks={decks}
                    deckId={deckId}
                    deckName={deckName}
                    loadingDecks={loadingDecks}
                    saving={saving}
                    validation={validation}
                    onLoadDeck={onLoadDeck}
                    onClearEditor={onClearEditor}
                    onSetDeckName={onSetDeckName}
                    onSaveDeck={onSaveDeck}
                    onSubmitSealed={onSubmitSealed}
                    onSubmitDraft={onSubmitDraft}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deck selector - hidden in sealed/draft modes */}
        {/* DeckTopBarActions dropdown is rendered inline under the toggle button above */}

        {/* Sorting controls moved next to the title/help to keep them in the top row */}

        {/* Validation status and submit actions */}
        <div className="ml-auto flex items-center gap-3">
          <DeckValidation
            avatarCount={avatarCount}
            atlasCount={atlasCount}
            spellbookCount={spellbookNonAvatar}
            validation={validation}
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

      {helpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 bg-black/70" onClick={() => setHelpOpen(false)} />
          <div className="relative bg-slate-900 text-white rounded-lg p-6 w-[min(90vw,720px)] ring-1 ring-white/20 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold">Editor Help</div>
              <button
                onClick={() => setHelpOpen(false)}
                className="h-8 w-8 grid place-items-center rounded bg-white/10 hover:bg-white/20"
                aria-label="Close help"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-sm opacity-90">
              <div>
                <div className="font-medium mb-1">Board (3D) interactions</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Drag cards to position them; drop on deck (top) or sideboard (bottom).</li>
                  <li>Click a card to quickly move between Deck ⇄ Sideboard.</li>
                  <li>Enable/disable auto-stacking with the stack icon; use refresh to re-apply.</li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Your Deck panel</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Right‑click a card row to move a copy between Deck/Sideboard or open options.</li>
                  <li>Hover a row to preview the card.</li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Adding cards</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Use the bottom “Add Cards” search; click “+ Deck” or “+ Side”.</li>
                  <li>Open “Add Standard Cards” for Spellslinger and standard Sites.</li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Sorting</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Auto‑stack groups similar cards; toggle with the green stack icon.</li>
                  <li>Manual positions are respected when auto‑stacking is off.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
