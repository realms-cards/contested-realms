"use client";

import { HelpCircle, Shuffle, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import DeckTopBarActions from "@/app/decks/editor-3d/DeckTopBarActions";
import UserBadge from "@/components/auth/UserBadge";
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
  deckIsPublic: boolean;
  deckIsOwner: boolean;
  deckCreatorName: string | null;
  loadingDecks: boolean;
  // Sorting
  pick3DLength: number;
  isSortingEnabled: boolean;
  onToggleSort: () => void;
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
  onTogglePublic: (isPublic: boolean) => void;
  onMakeCopy: () => void;
  onSaveDeck: () => void;
  onSubmitSealed: () => void;
  onSubmitDraft: () => void;
};

export default function DeckPanels(props: DeckPanelsProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const iconButtonStyles = useMemo(
    () => ({
      base:
        "h-9 w-9 grid place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
      active:
        "bg-emerald-500/80 text-black border-emerald-400 hover:bg-emerald-400 focus-visible:ring-emerald-300",
      toggled:
        "bg-white/15 text-white border-white/30 hover:bg-white/20",
    }),
    []
  );
  const {
    isDraftMode,
    isSealed,
    status,
    decks,
    deckId,
    deckName,
    deckIsPublic,
    deckIsOwner,
    deckCreatorName,
    loadingDecks,
    pick3DLength,
    isSortingEnabled,
    onToggleSort,
    avatarCount,
    atlasCount,
    spellbookNonAvatar,
    validation,
    saving,
    onLoadDeck,
    onClearEditor,
    onSetDeckName,
    onTogglePublic,
    onMakeCopy,
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
              <span className="text-lg text-orange-400 ml-2">
                (Draft Completion Mode)
              </span>
            )}
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            className={`${iconButtonStyles.base} text-blue-200 hover:text-blue-100 hover:bg-blue-500/20 border-blue-300/30 focus-visible:ring-blue-200/50`}
            title="How to use the editor"
            aria-label="How to use the editor"
          >
            <HelpCircle className="h-5 w-5" strokeWidth={2.5} />
          </button>
          {pick3DLength > 0 && (
            <button
              onClick={onToggleSort}
              title={
                isSortingEnabled
                  ? "Disable auto-stacking"
                  : "Enable auto-stacking"
              }
              aria-label={
                isSortingEnabled
                  ? "Disable auto-stacking"
                  : "Enable auto-stacking"
              }
              className={`${iconButtonStyles.base} ${
                isSortingEnabled ? iconButtonStyles.active : ""
              }`}
            >
              <Shuffle className="h-5 w-5" strokeWidth={2.5} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setControlsOpen((v) => !v)}
              className={`${iconButtonStyles.base} ${
                controlsOpen ? iconButtonStyles.toggled : ""
              }`}
              title={controlsOpen ? "Hide deck controls" : "Show deck controls"}
              aria-label={
                controlsOpen ? "Hide deck controls" : "Show deck controls"
              }
            >
              <SlidersHorizontal className="h-5 w-5" strokeWidth={2.5} />
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
                    deckIsPublic={deckIsPublic}
                    deckIsOwner={deckIsOwner}
                    deckCreatorName={deckCreatorName}
                    loadingDecks={loadingDecks}
                    saving={saving}
                    validation={validation}
                    onLoadDeck={onLoadDeck}
                    onClearEditor={onClearEditor}
                    onSetDeckName={onSetDeckName}
                    onTogglePublic={onTogglePublic}
                    onMakeCopy={onMakeCopy}
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
          <UserBadge className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/80 hover:text-white hover:bg-white/10" showPresence={false} />
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
                saving ||
                status !== "authenticated" ||
                (isDraftMode &&
                  (!validation.avatar ||
                    !validation.atlas ||
                    !validation.spellbook))
              }
              className="h-10 px-4 rounded text-white disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
              title={
                isDraftMode &&
                (!validation.avatar ||
                  !validation.atlas ||
                  !validation.spellbook)
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
                saving ||
                status !== "authenticated" ||
                !validation.avatar ||
                !validation.atlas ||
                !validation.spellbook
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
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setHelpOpen(false)}
          />
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
                  <li>
                    Drag cards to position them; drop on deck (top) or sideboard
                    (bottom).
                  </li>
                  <li>
                    Click a card to quickly move between Deck ⇄ Sideboard.
                  </li>
                  <li>
                    Enable/disable auto-stacking with the stack icon
                    (automatically re-applies when toggled).
                  </li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Your Deck panel</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Right‑click a card row to move a copy between Deck/Sideboard
                    or open options.
                  </li>
                  <li>Hover a row to preview the card.</li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Adding cards</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Use the bottom “Add Cards” search; click “+ Deck” or “+
                    Side”.
                  </li>
                  <li>
                    Open “Add Standard Cards” for Spellslinger and standard
                    Sites.
                  </li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Sorting</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Auto‑stack groups similar cards; toggle with the green stack
                    icon.
                  </li>
                  <li>
                    Manual positions are respected when auto‑stacking is off.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
