"use client";

import { FolderOpen } from "lucide-react";
import React from "react";
import { RcButton, rcButtonVariants } from "@/components/ui/rc-button";
type DeckListItem = { id: string; name: string; format: string };

type DeckTopBarActionsProps = {
  isSealed: boolean;
  isDraftMode: boolean;
  status: "authenticated" | "unauthenticated" | "loading";
  decks: DeckListItem[];
  deckId: string | null;
  deckName: string;
  deckIsPublic: boolean;
  deckIsOwner: boolean;
  deckCreatorName: string | null;
  loadingDecks: boolean;
  saving: boolean;
  validation: { avatar: boolean; atlas: boolean; spellbook: boolean };
  onLoadDeck: (id: string) => void;
  onClearEditor: () => void;
  onSetDeckName: (name: string) => void;
  onTogglePublic: (isPublic: boolean) => void;
  onMakeCopy: () => void;
  onSaveDeck: () => void;
  onSubmitSealed: () => void;
  onSubmitDraft: () => void;
  onAddStandardCards?: () => void;
};

export default function DeckTopBarActions(props: DeckTopBarActionsProps) {
  const {
    isSealed,
    isDraftMode,
    status,
    decks,
    deckId,
    deckIsPublic,
    deckIsOwner,
    loadingDecks,
    saving,
    validation,
    onLoadDeck,
    onClearEditor,
    onTogglePublic,
    onMakeCopy,
    onSubmitSealed,
    onSubmitDraft,
  } = props;

  const [chooserOpen, setChooserOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-3 relative">
      {!isSealed && !isDraftMode && (
        <>
          {/* Load deck (dropdown chooser) */}
          <div className="relative">
            <RcButton
              variant="outline"
              size="icon"
              onClick={() => setChooserOpen((v) => !v)}
              disabled={status !== "authenticated"}
              className="h-9 w-9 text-rc-fg-muted disabled:pointer-events-auto disabled:cursor-not-allowed"
              title={
                status !== "authenticated"
                  ? "Sign in to load decks"
                  : "Load deck"
              }
              aria-label="Load deck"
            >
              <FolderOpen className="w-5 h-5" strokeWidth={2.25} />
            </RcButton>
            {chooserOpen && (
              <div className="thin-scrollbar absolute z-50 mt-2 w-64 max-h-[40vh] overflow-y-auto rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-2 text-rc-fg shadow-rc-panel">
                <button
                  className="w-full text-left px-2 py-1 rounded-rc-sm font-rc-sans text-rc-fg transition-colors hover:bg-rc-accent/8 hover:text-rc-fg-strong"
                  onClick={() => {
                    onClearEditor();
                    setChooserOpen(false);
                  }}
                >
                  + New Deck
                </button>
                <div className="my-2 h-px bg-rc-line/12" />
                {loadingDecks ? (
                  <div className="rc-hint px-2 py-1">Loading…</div>
                ) : !decks || decks.length === 0 ? (
                  <div className="rc-hint px-2 py-1">No decks</div>
                ) : (
                  decks.map((d) => (
                    <button
                      key={d.id}
                      className={`w-full text-left px-2 py-1 rounded-rc-sm font-rc-sans transition-colors hover:bg-rc-accent/8 ${
                        d.id === deckId
                          ? "bg-rc-accent/8 text-rc-fg-strong"
                          : "text-rc-fg"
                      }`}
                      onClick={() => {
                        onLoadDeck(d.id);
                        setChooserOpen(false);
                      }}
                      title={`Load ${d.name}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{d.name}</span>
                        <span className="rc-hint">{d.format}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}

      {status !== "authenticated" && (
        <div className="rc-alert flex items-center gap-2 px-3 py-2" data-tone="warning">
          <span className="font-rc-sans text-sm">Sign in to save or load decks</span>
          <a
            href="/auth/signin?callbackUrl=%2Fdecks%2Feditor-3d"
            className={rcButtonVariants({ variant: "outline", size: "sm" })}
          >
            Sign In
          </a>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!deckIsOwner ? (
          // Read-only view - show copy button
          <RcButton
            variant="outline"
            onClick={onMakeCopy}
            disabled={saving || status !== "authenticated"}
            className="h-10 px-4"
            title="Create a private copy of this deck that you can edit"
          >
            {saving ? "Copying..." : "Make Private Copy"}
          </RcButton>
        ) : (
          // Owner view - show edit controls
          <>
            {!isSealed && !isDraftMode && (
              <RcButton
                variant="quiet"
                size="sm"
                onClick={() => onTogglePublic(!deckIsPublic)}
                disabled={status !== "authenticated"}
                className={`h-9 text-xs ${
                  deckIsPublic
                    ? "border-rc-success/50 bg-rc-success/20 text-rc-fg-strong hover:border-rc-success/50 hover:bg-rc-success/30 hover:text-rc-fg-strong"
                    : ""
                }`}
                title={
                  deckIsPublic
                    ? "Deck is public - others can view it"
                    : "Deck is private - only you can view it"
                }
              >
                {deckIsPublic ? "Public" : "Private"}
              </RcButton>
            )}

            {isSealed ? (
              <RcButton
                variant="outline"
                onClick={onSubmitSealed}
                disabled={saving || status !== "authenticated"}
                className="h-10 px-4 disabled:pointer-events-auto disabled:cursor-not-allowed"
                title={
                  status !== "authenticated"
                    ? "Sign in to submit"
                    : "Submit sealed deck to match"
                }
              >
                {saving ? "Submitting..." : "Submit Sealed Deck"}
              </RcButton>
            ) : isDraftMode ? (
              <div className="flex items-center gap-2">
                {props.onAddStandardCards && (
                  <RcButton
                    variant="outline"
                    onClick={props.onAddStandardCards}
                    className="h-9 px-3"
                    type="button"
                  >
                    Add Standard Cards
                  </RcButton>
                )}
                <RcButton
                  variant="outline"
                  onClick={onSubmitDraft}
                  disabled={
                    saving ||
                    status !== "authenticated" ||
                    !validation.avatar ||
                    !validation.atlas ||
                    !validation.spellbook
                  }
                  className="h-10 px-4 disabled:pointer-events-auto disabled:cursor-not-allowed"
                  title={
                    !validation.avatar ||
                    !validation.atlas ||
                    !validation.spellbook
                      ? "Cannot submit invalid deck"
                      : "Submit draft deck"
                  }
                >
                  {saving ? "Submitting..." : "Submit Draft Deck"}
                </RcButton>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
