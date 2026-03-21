"use client";

import {
  ArrowLeft,
  HelpCircle,
  Layers,
  Pencil,
  Shuffle,
  SlidersHorizontal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useMemo, useState } from "react";
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
  // 2D/3D view mode
  viewMode?: "2d" | "3d";
  onToggleViewMode?: () => void;
  // Mana curve & thresholds for inline display
  manaCurve?: Record<number, number>;
  thresholdSummary?: { elements: string[]; summary: Record<string, number> };
};

function DeckTitle({
  deckName,
  deckIsOwner,
  isDraftMode,
  isFreeMode,
  isSealed,
  onSetDeckName,
}: {
  deckName: string;
  deckIsOwner: boolean;
  isDraftMode: boolean;
  isFreeMode: boolean;
  isSealed: boolean;
  onSetDeckName: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(deckName);

  React.useEffect(() => setTempName(deckName), [deckName]);

  const modeLabel = isDraftMode
    ? "(Draft)"
    : isSealed
    ? "(Sealed)"
    : isFreeMode
    ? "(Free Mode)"
    : null;

  const displayName = deckName || "New Deck";

  return (
    <div className="flex items-center gap-2">
      {deckIsOwner && editing ? (
        <input
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          onBlur={() => {
            onSetDeckName(tempName);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSetDeckName(tempName);
              setEditing(false);
            }
            if (e.key === "Escape") {
              setTempName(deckName);
              setEditing(false);
            }
          }}
          className="text-lg font-fantaisie border-b-2 border-white/40 bg-transparent text-white outline-none max-w-[20ch] px-1"
          placeholder="Deck name"
          autoFocus
        />
      ) : (
        <div
          className="text-lg font-fantaisie text-white max-w-[20ch] truncate"
          title={displayName}
        >
          {displayName}
        </div>
      )}
      {deckIsOwner && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="h-7 w-7 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
          title="Rename deck"
          aria-label="Rename deck"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {modeLabel && (
        <span
          className={`text-sm ml-1 ${
            isDraftMode
              ? "text-orange-400"
              : isSealed
              ? "text-amber-400"
              : "text-blue-400"
          }`}
        >
          {modeLabel}
        </span>
      )}
    </div>
  );
}

export default function DeckPanels(props: DeckPanelsProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const iconButtonStyles = useMemo(
    () => ({
      base: "h-8 w-8 grid place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
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
    // View mode
    viewMode = "3d",
    onToggleViewMode,
    // Mana curve
    manaCurve = {},
    thresholdSummary = { elements: [], summary: {} },
  } = props;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      {/* Single-row top bar */}
      <div className="mx-auto px-3 py-1.5 flex items-center gap-2 pointer-events-auto select-none">
        {/* Left: nav + title + icon buttons */}
        {isFreeMode && !tournamentId && (
          <Link
            href="/decks"
            className="flex items-center px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-none"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        {tournamentId && (
          <Link
            href={`/tournaments/${encodeURIComponent(tournamentId)}`}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-md flex-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Tournament
          </Link>
        )}
        {onToggleViewMode && (
          <button
            onClick={onToggleViewMode}
            className={`${iconButtonStyles.base} ${
              viewMode === "2d" ? "bg-blue-600/80 text-white border-blue-500" : ""
            } flex-none`}
            title={viewMode === "3d" ? "Switch to 2D view" : "Switch to 3D view"}
            aria-label={viewMode === "3d" ? "Switch to 2D view" : "Switch to 3D view"}
          >
            <Layers className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        <DeckTitle
          deckName={deckName}
          deckIsOwner={deckIsOwner}
          isDraftMode={isDraftMode}
          isFreeMode={isFreeMode}
          isSealed={isSealed}
          onSetDeckName={onSetDeckName}
        />
        {isFreeMode && onFreeValidationModeChange && (
          <div className="flex items-center gap-0.5 bg-black/40 rounded p-0.5 border border-white/10 flex-none">
            <button
              onClick={() => onFreeValidationModeChange("constructed")}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
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
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
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
          className={`${iconButtonStyles.base} text-blue-200 hover:text-blue-100 hover:bg-blue-500/20 border-blue-300/30 focus-visible:ring-blue-200/50 flex-none`}
          title="How to use the editor"
          aria-label="How to use the editor"
        >
          <HelpCircle className="h-4 w-4" strokeWidth={2.5} />
        </button>
        {pick3DLength > 0 && (
          <button
            onClick={onToggleSort}
            title={isSortingEnabled ? "Disable auto-stacking" : "Enable auto-stacking"}
            aria-label={isSortingEnabled ? "Disable auto-stacking" : "Enable auto-stacking"}
            className={`${iconButtonStyles.base} ${isSortingEnabled ? iconButtonStyles.active : ""} flex-none`}
          >
            <Shuffle className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        {(isDraftMode || isSealed) &&
          hiddenCardCount > 0 &&
          onToggleShowHidden && (
            <button
              onClick={onToggleShowHidden}
              title={showHiddenCards ? `Hide ${hiddenCardCount} hidden cards` : `Show ${hiddenCardCount} hidden cards`}
              aria-label={showHiddenCards ? "Hide hidden cards" : "Show hidden cards"}
              className={`${iconButtonStyles.base} ${
                showHiddenCards ? iconButtonStyles.active : "ring-2 ring-yellow-500/50 border-yellow-500/50"
              } flex-none relative`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                {showHiddenCards ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                )}
              </svg>
              <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                {hiddenCardCount}
              </span>
            </button>
          )}

        {/* Save button + auto-save (free mode) */}
        {isFreeMode && status === "authenticated" && (
          <div className="flex items-center gap-1.5 flex-none">
            <button
              onClick={onSaveDeck}
              disabled={saving}
              className={`h-7 px-3 rounded-full font-semibold text-xs shadow transition-all flex items-center gap-1.5 ${
                saving
                  ? "bg-gray-600 text-white cursor-wait"
                  : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white"
              }`}
              title={saving ? "Saving…" : deckId ? "Update deck" : "Save new deck"}
            >
              {saving ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zM12 19a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z" />
                </svg>
              )}
              {saving ? "..." : "Save"}
            </button>
            {deckId && onToggleAutoSave && (
              <button
                onClick={() => onToggleAutoSave(!autoSaveEnabled)}
                className={`flex items-center gap-1 h-7 px-1.5 rounded-full text-[10px] font-medium transition-all ${
                  autoSaveEnabled
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30"
                    : "bg-white/10 text-white/60 border border-white/10 hover:bg-white/20 hover:text-white/80"
                }`}
                title={autoSaveEnabled ? "Auto-save ON" : "Auto-save OFF"}
              >
                <div className={`w-5 h-3 rounded-full relative transition-colors ${autoSaveEnabled ? "bg-blue-500" : "bg-white/30"}`}>
                  <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white shadow-sm transition-all ${autoSaveEnabled ? "left-2.5" : "left-0.5"}`} />
                </div>
                <span>Auto</span>
              </button>
            )}
          </div>
        )}

        <div className="relative flex-none">
          <button
            onClick={() => setControlsOpen((v) => !v)}
            className={`${iconButtonStyles.base} ${controlsOpen ? iconButtonStyles.toggled : ""}`}
            title={controlsOpen ? "Hide deck controls" : "Show deck controls"}
            aria-label={controlsOpen ? "Hide deck controls" : "Show deck controls"}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
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

        {/* Center/right: mana curve, thresholds, validation */}
        <div className="ml-auto flex items-center gap-2 flex-none">
          {pick3DLength > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-end gap-px h-7 bg-black/30 rounded px-1 py-0.5">
                {Array.from({ length: 8 }, (_, cost) => {
                  const count = manaCurve[cost] || 0;
                  const maxCount = Math.max(...Object.values(manaCurve), 1);
                  const height = (count / maxCount) * 100;
                  const label = cost === 7 ? "7+" : String(cost);
                  return (
                    <div key={cost} className="flex flex-col items-center justify-end gap-0 w-3.5 h-full">
                      <div
                        className="bg-blue-400/80 rounded-t min-h-[1px] w-2"
                        style={{ height: `${Math.max(height, count > 0 ? 10 : 0)}%` }}
                        title={`${label} mana: ${count} cards`}
                      />
                      <span className="text-[7px] text-white/40 leading-none">{label}</span>
                    </div>
                  );
                })}
              </div>
              {thresholdSummary.elements.length > 0 && (
                <div className="flex items-center gap-1">
                  {thresholdSummary.elements.map((element) => {
                    const count = thresholdSummary.summary[element as keyof typeof thresholdSummary.summary] || 0;
                    return (
                      <div key={element} className="flex items-center gap-px bg-black/30 px-0.5 py-0.5 rounded" title={`Max ${element} threshold: ${count}`}>
                        {Array.from({ length: count }, (_, i) => (
                          <Image key={i} src={`/api/assets/${element}.png`} alt={element} width={9} height={9} unoptimized />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
              disabled={saving || status !== "authenticated" || (isDraftMode && (!validation.avatar || !validation.atlas || !validation.spellbook))}
              className="h-7 px-3 rounded text-white text-xs disabled:opacity-50 bg-blue-600 hover:bg-blue-700 flex-none"
            >
              {saving ? "..." : "Submit Sealed"}
            </button>
          )}
          {isDraftMode && (
            <button
              onClick={onSubmitDraft}
              disabled={saving || status !== "authenticated" || !validation.avatar || !validation.atlas || !validation.spellbook}
              className="h-7 px-3 rounded text-white text-xs disabled:opacity-50 bg-purple-600 hover:bg-purple-700 flex-none"
            >
              {saving ? "..." : "Submit Draft"}
            </button>
          )}
          <UserBadge
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:text-white hover:bg-white/10 flex-none ml-2"
            showPresence={false}
          />
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
