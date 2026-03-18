"use client";

import { FolderOpen } from "lucide-react";
import React from "react";
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
            <button
              onClick={() => setChooserOpen((v) => !v)}
              disabled={status !== "authenticated"}
              className="h-9 w-9 grid place-items-center rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white disabled:opacity-50"
              title={
                status !== "authenticated"
                  ? "Sign in to load decks"
                  : "Load deck"
              }
              aria-label="Load deck"
            >
              <FolderOpen className="w-5 h-5" strokeWidth={2.25} />
            </button>
            {chooserOpen && (
              <div className="absolute z-50 mt-2 w-64 max-h-[40vh] overflow-y-auto rounded-lg bg-black/90 ring-1 ring-white/20 p-2">
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-white/90"
                  onClick={() => {
                    onClearEditor();
                    setChooserOpen(false);
                  }}
                >
                  + New Deck
                </button>
                <div className="my-2 h-px bg-white/10" />
                {loadingDecks ? (
                  <div className="px-2 py-1 text-white/60">Loading…</div>
                ) : !decks || decks.length === 0 ? (
                  <div className="px-2 py-1 text-white/60">No decks</div>
                ) : (
                  decks.map((d) => (
                    <button
                      key={d.id}
                      className={`w-full text-left px-2 py-1 rounded hover:bg-white/10 ${
                        d.id === deckId
                          ? "bg-white/10 text-white"
                          : "text-white/90"
                      }`}
                      onClick={() => {
                        onLoadDeck(d.id);
                        setChooserOpen(false);
                      }}
                      title={`Load ${d.name}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{d.name}</span>
                        <span className="text-xs opacity-70">{d.format}</span>
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
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-yellow-500/15 text-yellow-200 border border-yellow-500/30">
          <span className="text-sm">Sign in to save or load decks</span>
          <a
            href="/auth/signin?callbackUrl=%2Fdecks%2Feditor-3d"
            className="h-8 px-3 rounded bg-yellow-500/30 hover:bg-yellow-500/40 text-yellow-100 text-sm inline-flex items-center"
          >
            Sign In
          </a>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!deckIsOwner ? (
          // Read-only view - show copy button
          <button
            onClick={onMakeCopy}
            disabled={saving || status !== "authenticated"}
            className="h-10 px-4 rounded text-white disabled:opacity-50 bg-blue-600/80 hover:bg-blue-600"
            title="Create a private copy of this deck that you can edit"
          >
            {saving ? "Copying..." : "Make Private Copy"}
          </button>
        ) : (
          // Owner view - show edit controls
          <>
            {!isSealed && !isDraftMode && (
              <button
                onClick={() => onTogglePublic(!deckIsPublic)}
                disabled={status !== "authenticated"}
                className={`h-9 px-3 rounded text-xs font-medium border transition ${
                  deckIsPublic
                    ? "bg-green-600/80 hover:bg-green-600 text-white border-green-500"
                    : "bg-gray-600/80 hover:bg-gray-600 text-white border-gray-500"
                } disabled:opacity-50`}
                title={
                  deckIsPublic
                    ? "Deck is public - others can view it"
                    : "Deck is private - only you can view it"
                }
              >
                {deckIsPublic ? "Public" : "Private"}
              </button>
            )}

            {isSealed ? (
              <button
                onClick={onSubmitSealed}
                disabled={saving || status !== "authenticated"}
                className="h-10 px-4 rounded text-white disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
                title={
                  status !== "authenticated"
                    ? "Sign in to submit"
                    : "Submit sealed deck to match"
                }
              >
                {saving ? "Submitting..." : "Submit Sealed Deck"}
              </button>
            ) : isDraftMode ? (
              <div className="flex items-center gap-2">
                {props.onAddStandardCards && (
                  <button
                    onClick={props.onAddStandardCards}
                    className="h-9 px-3 rounded text-sm font-medium bg-white/10 hover:bg-white/20 text-white"
                    type="button"
                  >
                    Add Standard Cards
                  </button>
                )}
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
                    !validation.avatar ||
                    !validation.atlas ||
                    !validation.spellbook
                      ? "Cannot submit invalid deck"
                      : "Submit draft deck"
                  }
                >
                  {saving ? "Submitting..." : "Submit Draft Deck"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
