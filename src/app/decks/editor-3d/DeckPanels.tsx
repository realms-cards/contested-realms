"use client";

import {
  ArrowLeft,
  Grid3X3,
  HelpCircle,
  Shuffle,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
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
  // Hidden cards toggle for draft/sealed
  hiddenCardCount?: number;
  showHiddenCards?: boolean;
  onToggleShowHidden?: () => void;
  // Free mode indicator
  isFreeMode?: boolean;
  // Free mode validation toggle
  freeValidationMode?: "constructed" | "sealed";
  onFreeValidationModeChange?: (mode: "constructed" | "sealed") => void;
  validationMinimums?: { atlas: number; spellbook: number };
  // Auto-save toggle
  autoSaveEnabled?: boolean;
  onToggleAutoSave?: (enabled: boolean) => void;
  // Tournament context (for "Back to Tournament" link)
  tournamentId?: string | null;
  // Playmat/grid toggle
  showPlaymat?: boolean;
  onTogglePlaymat?: () => void;
};

export default function DeckPanels(props: DeckPanelsProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const iconButtonStyles = useMemo(
    () => ({
      base: "h-9 w-9 grid place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
      active:
        "bg-emerald-500/80 text-black border-emerald-400 hover:bg-emerald-400 focus-visible:ring-emerald-300",
      toggled: "bg-white/15 text-white border-white/30 hover:bg-white/20",
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
    // Hidden cards toggle
    hiddenCardCount = 0,
    showHiddenCards = false,
    onToggleShowHidden,
    // Free mode
    isFreeMode = false,
    freeValidationMode = "constructed",
    onFreeValidationModeChange,
    validationMinimums = { atlas: 12, spellbook: 24 },
    // Auto-save
    autoSaveEnabled = false,
    onToggleAutoSave,
    // Tournament context
    tournamentId,
    // Playmat toggle
    showPlaymat = true,
    onTogglePlaymat,
  } = props;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      <div className="max-w-7xl mx-auto p-4 lg:pr-[20rem] xl:pr-[24rem] 2xl:pr-[28rem] flex flex-wrap items-end gap-4 pointer-events-auto select-none">
        <div className="flex items-center gap-3">
          {/* Back to Decks link (free mode only) */}
          {isFreeMode && !tournamentId && (
            <Link
              href="/decks"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Decks
            </Link>
          )}
          {/* Back to Tournament link */}
          {tournamentId && (
            <Link
              href={`/tournaments/${encodeURIComponent(tournamentId)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-medium transition-colors shadow-md"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Tournament
            </Link>
          )}
          {/* Playmat/Grid toggle */}
          {onTogglePlaymat && (
            <button
              onClick={onTogglePlaymat}
              className={`${iconButtonStyles.base} ${
                !showPlaymat ? "bg-blue-600/80 text-white border-blue-500" : ""
              }`}
              title={
                showPlaymat
                  ? "Hide playmat (show grid)"
                  : "Show playmat (hide grid)"
              }
              aria-label={showPlaymat ? "Hide playmat" : "Show playmat"}
            >
              <Grid3X3 className="h-5 w-5" strokeWidth={2.5} />
            </button>
          )}
          <div className="text-3xl font-fantaisie text-white">
            Deck Editor
            {isDraftMode && (
              <span className="text-lg text-orange-400 ml-2">
                (Draft Completion Mode)
              </span>
            )}
            {isFreeMode && (
              <span className="text-lg text-blue-400 ml-2">(Free Mode)</span>
            )}
          </div>
          {/* Validation mode toggle for free mode */}
          {isFreeMode && onFreeValidationModeChange && (
            <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => onFreeValidationModeChange("constructed")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  freeValidationMode === "constructed"
                    ? "bg-blue-500 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
                title={`Constructed: ${validationMinimums.atlas}+ sites, ${validationMinimums.spellbook}+ spells (40 cards min)`}
              >
                Constructed
              </button>
              <button
                onClick={() => onFreeValidationModeChange("sealed")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  freeValidationMode === "sealed"
                    ? "bg-amber-500 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
                title="Sealed: 8+ sites, 18+ spells (30 cards min)"
              >
                Sealed
              </button>
            </div>
          )}
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
          {/* Hidden cards toggle for draft/sealed */}
          {(isDraftMode || isSealed) &&
            hiddenCardCount > 0 &&
            onToggleShowHidden && (
              <button
                onClick={onToggleShowHidden}
                title={
                  showHiddenCards
                    ? `Hide ${hiddenCardCount} hidden cards`
                    : `Show ${hiddenCardCount} hidden cards`
                }
                aria-label={
                  showHiddenCards ? "Hide hidden cards" : "Show hidden cards"
                }
                className={`${iconButtonStyles.base} ${
                  showHiddenCards
                    ? iconButtonStyles.active
                    : "ring-2 ring-yellow-500/50 border-yellow-500/50"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  {showHiddenCards ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  )}
                </svg>
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {hiddenCardCount}
                </span>
              </button>
            )}
          {/* Prominent save button for free mode */}
          {isFreeMode && status === "authenticated" && !saving && (
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={onSaveDeck}
                className="h-9 px-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-semibold text-sm shadow-lg transition-all flex items-center gap-2"
                title={deckId ? "Update deck" : "Save new deck"}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zM12 19a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z" />
                </svg>
                {deckId ? "Save" : "Save Deck"}
              </button>
              {/* Auto-save toggle */}
              {deckId && onToggleAutoSave && (
                <button
                  onClick={() => onToggleAutoSave(!autoSaveEnabled)}
                  className={`flex items-center gap-1.5 h-8 px-2 rounded-full text-xs font-medium transition-all ${
                    autoSaveEnabled
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30"
                      : "bg-white/10 text-white/60 border border-white/10 hover:bg-white/20 hover:text-white/80"
                  }`}
                  title={
                    autoSaveEnabled
                      ? "Auto-save is ON - click to disable"
                      : "Auto-save is OFF - click to enable"
                  }
                >
                  <div
                    className={`w-6 h-3.5 rounded-full relative transition-colors ${
                      autoSaveEnabled ? "bg-blue-500" : "bg-white/30"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-all ${
                        autoSaveEnabled ? "left-3" : "left-0.5"
                      }`}
                    />
                  </div>
                  <span>Auto</span>
                </button>
              )}
            </div>
          )}
          {isFreeMode && saving && (
            <div className="ml-2 h-9 px-4 rounded-full bg-gray-600 text-white font-semibold text-sm flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 12a8 8 0 018-8"
                />
              </svg>
              Saving...
            </div>
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
          <DeckValidation
            avatarCount={avatarCount}
            atlasCount={atlasCount}
            spellbookCount={spellbookNonAvatar}
            validation={validation}
            minAtlas={validationMinimums.atlas}
            minSpellbook={validationMinimums.spellbook}
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

      <div className="pointer-events-auto absolute top-4 right-4 sm:top-5 sm:right-6">
        <UserBadge
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/80 hover:text-white hover:bg-white/10"
          showPresence={false}
        />
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
