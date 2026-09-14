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
import React, { useState } from "react";
import DeckTopBarActions from "@/app/decks/editor-3d/DeckTopBarActions";
import UserBadge from "@/components/auth/UserBadge";
import { DeckValidation } from "@/components/deck-editor";
import { RcButton, rcButtonVariants } from "@/components/ui/rc-button";

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
  validationMinimums?: {
    atlas: number;
    spellbook: number;
    sitesInSpellbook?: boolean;
  };
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
          className="text-lg font-rc-display border-b-2 border-rc-line/40 bg-transparent text-rc-fg-strong outline-none focus:border-rc-accent max-w-[20ch] px-1"
          placeholder="Deck name"
          autoFocus
        />
      ) : (
        <div
          className="text-lg font-rc-display text-rc-fg-strong max-w-[20ch] truncate"
          title={displayName}
        >
          {displayName}
        </div>
      )}
      {deckIsOwner && !editing && (
        <RcButton
          variant="quiet"
          size="icon-xs"
          onClick={() => setEditing(true)}
          title="Rename deck"
          aria-label="Rename deck"
        >
          <Pencil className="h-3.5 w-3.5" />
        </RcButton>
      )}
      {modeLabel && (
        <span
          className={`font-rc-mono text-sm ml-1 ${
            isDraftMode
              ? "text-rc-ember"
              : isSealed
              ? "text-rc-accent-link"
              : "text-rc-info"
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
    validationMinimums = { atlas: 12, spellbook: 24, sitesInSpellbook: false },
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
            className={rcButtonVariants({
              variant: "quiet",
              size: "icon-xs",
              className: "flex-none",
            })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        {tournamentId && (
          <Link
            href={`/tournaments/${encodeURIComponent(tournamentId)}`}
            className={rcButtonVariants({
              variant: "quiet",
              size: "xs",
              className: "gap-1 px-2 text-rc-fg flex-none",
            })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Tournament
          </Link>
        )}
        {onToggleViewMode && (
          <RcButton
            variant="quiet"
            size="icon-xs"
            tone="info"
            onClick={onToggleViewMode}
            aria-pressed={viewMode === "2d"}
            className="h-8 w-8 flex-none"
            title={viewMode === "3d" ? "Switch to 2D view" : "Switch to 3D view"}
            aria-label={viewMode === "3d" ? "Switch to 2D view" : "Switch to 3D view"}
          >
            <Layers className="h-4 w-4" strokeWidth={2.5} />
          </RcButton>
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
          <div className="rc-segment bg-black/40 text-[10px] tracking-[0.08em] flex-none">
            <button
              onClick={() => onFreeValidationModeChange("constructed")}
              aria-pressed={freeValidationMode === "constructed"}
              data-tone="info"
              className="px-2 py-0.5"
              title={`Constructed: ${validationMinimums.atlas}+ sites, ${validationMinimums.spellbook}+ spells (40 cards min)`}
            >
              Constructed
            </button>
            <button
              onClick={() => onFreeValidationModeChange("sealed")}
              aria-pressed={freeValidationMode === "sealed"}
              data-tone="info"
              className="px-2 py-0.5"
              title="Sealed: 8+ sites, 18+ spells (30 cards min)"
            >
              Sealed
            </button>
          </div>
        )}
        <RcButton
          variant="quiet"
          size="icon-xs"
          onClick={() => setHelpOpen(true)}
          className="h-8 w-8 flex-none"
          title="How to use the editor"
          aria-label="How to use the editor"
        >
          <HelpCircle className="h-4 w-4" strokeWidth={2.5} />
        </RcButton>
        {pick3DLength > 0 && (
          <RcButton
            variant="quiet"
            size="icon-xs"
            tone="success"
            onClick={onToggleSort}
            title={isSortingEnabled ? "Disable auto-stacking" : "Enable auto-stacking"}
            aria-label={isSortingEnabled ? "Disable auto-stacking" : "Enable auto-stacking"}
            aria-pressed={isSortingEnabled}
            className="h-8 w-8 flex-none"
          >
            <Shuffle className="h-4 w-4" strokeWidth={2.5} />
          </RcButton>
        )}
        {(isDraftMode || isSealed) &&
          hiddenCardCount > 0 &&
          onToggleShowHidden && (
            <RcButton
              variant="quiet"
              size="icon-xs"
              tone="success"
              onClick={onToggleShowHidden}
              title={showHiddenCards ? `Hide ${hiddenCardCount} hidden cards` : `Show ${hiddenCardCount} hidden cards`}
              aria-label={showHiddenCards ? "Hide hidden cards" : "Show hidden cards"}
              aria-pressed={showHiddenCards}
              className={`h-8 w-8 ${
                showHiddenCards ? "" : "border-rc-warning/50 ring-2 ring-rc-warning/50"
              } flex-none relative`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                {showHiddenCards ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                )}
              </svg>
              <span className="absolute -top-1 -right-1 bg-rc-warning text-rc-accent-fg font-rc-mono text-[10px] font-bold tabular-nums rounded-full h-3.5 w-3.5 flex items-center justify-center">
                {hiddenCardCount}
              </span>
            </RcButton>
          )}

        {/* Save button + auto-save (free mode) */}
        {isFreeMode && status === "authenticated" && (
          <div className="flex items-center gap-1.5 flex-none">
            <RcButton
              variant={saving ? "quiet" : "default"}
              size="xs"
              onClick={onSaveDeck}
              disabled={saving}
              className="px-3 disabled:opacity-100"
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
            </RcButton>
            {deckId && onToggleAutoSave && (
              <button
                onClick={() => onToggleAutoSave(!autoSaveEnabled)}
                aria-pressed={autoSaveEnabled}
                className={`flex items-center gap-1 h-7 px-1.5 rounded-full font-rc-mono text-[10px] font-medium transition-all ${
                  autoSaveEnabled
                    ? "bg-rc-success/16 text-rc-success-ink border border-rc-success/60 hover:bg-rc-success/24"
                    : "bg-[rgba(7,10,20,0.85)] text-rc-fg-muted border border-rc-line/22 hover:border-rc-line/35 hover:text-rc-fg"
                }`}
                title={autoSaveEnabled ? "Auto-save ON" : "Auto-save OFF"}
              >
                <div className={`w-5 h-3 rounded-full relative transition-colors ${autoSaveEnabled ? "bg-rc-success" : "bg-rc-line/30"}`}>
                  <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-rc-fg-strong shadow-rc-sm transition-all ${autoSaveEnabled ? "left-2.5" : "left-0.5"}`} />
                </div>
                <span>Auto</span>
              </button>
            )}
          </div>
        )}

        <div className="relative flex-none">
          <RcButton
            variant="quiet"
            size="icon-xs"
            onClick={() => setControlsOpen((v) => !v)}
            aria-pressed={controlsOpen}
            className="h-8 w-8"
            title={controlsOpen ? "Hide deck controls" : "Show deck controls"}
            aria-label={controlsOpen ? "Hide deck controls" : "Show deck controls"}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
          </RcButton>
          {controlsOpen && (
            <div className="absolute top-full left-0 mt-2 z-[60] pointer-events-auto">
              <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-3 text-rc-fg shadow-rc-panel">
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
              <div className="flex items-end gap-px h-7 bg-black/30 rounded-rc-sm px-1 py-0.5">
                {Array.from({ length: 8 }, (_, cost) => {
                  const count = manaCurve[cost] || 0;
                  const maxCount = Math.max(...Object.values(manaCurve), 1);
                  const height = (count / maxCount) * 100;
                  const label = cost === 7 ? "7+" : String(cost);
                  return (
                    <div key={cost} className="flex flex-col items-center justify-end gap-0 w-3.5 h-full">
                      <div
                        className="bg-rc-accent/80 rounded-t min-h-[1px] w-2"
                        style={{ height: `${Math.max(height, count > 0 ? 10 : 0)}%` }}
                        title={`${label} mana: ${count} cards`}
                      />
                      <span className="font-rc-mono text-[7px] text-rc-fg-subtle leading-none">{label}</span>
                    </div>
                  );
                })}
              </div>
              {thresholdSummary.elements.length > 0 && (
                <div className="flex items-center gap-1">
                  {thresholdSummary.elements.map((element) => {
                    const count = thresholdSummary.summary[element as keyof typeof thresholdSummary.summary] || 0;
                    return (
                      <div key={element} className="flex items-center gap-px bg-black/30 px-0.5 py-0.5 rounded-rc-sm" title={`Max ${element} threshold: ${count}`}>
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
            sitesInSpellbook={validationMinimums.sitesInSpellbook}
          />
          {isSealed && (
            <RcButton
              size="sm"
              onClick={onSubmitSealed}
              disabled={saving || status !== "authenticated" || (isDraftMode && (!validation.avatar || !validation.atlas || !validation.spellbook))}
              className="h-7 px-3 text-xs flex-none"
            >
              {saving ? "..." : "Submit Sealed"}
            </RcButton>
          )}
          {isDraftMode && (
            <RcButton
              size="sm"
              onClick={onSubmitDraft}
              disabled={saving || status !== "authenticated" || !validation.avatar || !validation.atlas || !validation.spellbook}
              className="h-7 px-3 text-xs flex-none"
            >
              {saving ? "..." : "Submit Draft"}
            </RcButton>
          )}
          <UserBadge
            className="inline-flex items-center gap-2 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.85)] px-2 py-1 text-xs text-rc-fg-muted hover:border-rc-accent/45 hover:text-rc-fg-strong flex-none ml-2"
            showPresence={false}
          />
        </div>
      </div>

      {helpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
          <div
            className="absolute inset-0 bg-[rgba(6,10,20,0.7)] backdrop-blur-[4px]"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] text-rc-fg p-6 w-[min(90vw,720px)] shadow-rc-panel">
            <div className="flex items-center justify-between mb-4">
              <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">Editor Help</div>
              <button
                onClick={() => setHelpOpen(false)}
                className="h-8 w-8 grid place-items-center rounded-rc-md text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
                aria-label="Close help"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 font-rc-sans text-sm text-rc-fg-muted">
              <div>
                <div className="rc-eyebrow mb-1">Board (3D) interactions</div>
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
                <div className="rc-eyebrow mb-1">Your Deck panel</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Right‑click a card row to move a copy between Deck/Sideboard
                    or open options.
                  </li>
                  <li>Hover a row to preview the card.</li>
                </ul>
              </div>
              <div>
                <div className="rc-eyebrow mb-1">Adding cards</div>
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
                <div className="rc-eyebrow mb-1">Sorting</div>
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
