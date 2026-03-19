"use client";

/**
 * Floating action bar shown when marquee selection is active in the deck editor/draft.
 * Provides mass actions: Move to Deck, Move to Sideboard, Stack, Expand, Remove, Clear.
 */
export function EditorMarqueeActionBar({
  count,
  onMoveToDeck,
  onMoveToSideboard,
  onMoveToCollection,
  onStack,
  onExpand,
  onRemove,
  onClear,
  hasStackable,
  hasExpandable,
}: {
  count: number;
  /** Optional — shown in draft/sealed where cards move from sideboard to deck */
  onMoveToDeck?: () => void;
  onMoveToSideboard: () => void;
  onMoveToCollection?: () => void;
  onStack?: () => void;
  onExpand?: () => void;
  onRemove: () => void;
  onClear: () => void;
  /** True when >=2 selected cards can be stacked into a pile */
  hasStackable?: boolean;
  /** True when any selected card is in a pile that can be expanded */
  hasExpandable?: boolean;
}) {
  if (count === 0) return null;

  return (
    <div
      data-marquee-bar
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 ring-1 ring-cyan-500/40 backdrop-blur-sm shadow-lg"
    >
      <span className="text-xs text-cyan-300 font-medium mr-1">
        {count} selected
      </span>

      {onMoveToDeck && (
        <button
          type="button"
          onClick={onMoveToDeck}
          className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors"
        >
          To Deck
        </button>
      )}

      <button
        type="button"
        onClick={onMoveToSideboard}
        className="px-2.5 py-1 text-xs font-medium rounded bg-amber-600/80 hover:bg-amber-600 text-white transition-colors"
      >
        To Sideboard
      </button>

      {onMoveToCollection && (
        <button
          type="button"
          onClick={onMoveToCollection}
          className="px-2.5 py-1 text-xs font-medium rounded bg-violet-600/80 hover:bg-violet-600 text-white transition-colors"
        >
          To Collection
        </button>
      )}

      {hasStackable && onStack && (
        <button
          type="button"
          onClick={onStack}
          className="px-2.5 py-1 text-xs font-medium rounded bg-cyan-600/80 hover:bg-cyan-600 text-white transition-colors"
        >
          Stack
        </button>
      )}

      {hasExpandable && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="px-2.5 py-1 text-xs font-medium rounded bg-teal-600/80 hover:bg-teal-600 text-white transition-colors"
        >
          Expand
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="px-2.5 py-1 text-xs font-medium rounded bg-red-600/80 hover:bg-red-600 text-white transition-colors"
      >
        Remove
      </button>

      <button
        type="button"
        onClick={onClear}
        className="px-2.5 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
