"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import ActionFeed2D from "./ActionFeed2D";
import PreviewPanel2D from "./PreviewPanel2D";
import type { Board2DSizing, Box2D } from "./useBoard2DSizing";

/** The portrait feed's least useful height: its turn header and one entry's first line. */
const FEED_MIN_H = 48;

/** The prompt panel rendered no banner and the board portalled no option rows into the dock. */
const NO_PROMPT = ":has(>div>#engine-prompt-dock:first-child:empty)";
/** ...and its opposite: something is docked (a banner, the pick guide or option rows). */
const PROMPT_UP = ":has([data-docked-banner],#engine-prompt-dock:not(:empty))";

/**
 * - The dock hides itself while it holds nothing (PromptDock always renders the
 *   option-row element last, so it is the first child only when the panel rendered nothing).
 * - A phone's landscape column keeps a previewed card while a prompt is docked, but only a
 *   third of the column: the prompt is what the player has to read in full.
 * - Portrait's dock box holds the status line on top, then any prompt (as tall as its
 *   content; its text scrolls above its buttons when the box is short), then the action feed
 *   in whatever is left — when that is at least FEED_MIN_H; else (`data-feed-off`, set by
 *   usePortraitFeedFit) the feed steps aside and the prompt grows into the space, its buttons
 *   at the bottom. The card preview keeps its half of the row at every size.
 * - The status slot collapses while the status line and the control banner are both silent
 *   (no empty band). It keeps its node — and so the live region — with no height at all.
 */
const SIDEBAR_CSS = [
  `[data-side-dock]${NO_PROMPT}{display:none}`,
  `[data-sidebar=landscape]${PROMPT_UP}>[data-side-preview]{max-height:50%}`,
  // A phone's landscape column with a card previewed while a prompt is up: the card beside the
  // prompt (left, the full height above the status line) rather than a strip above it, so it
  // stays larger than the hand's cards; the feed takes what the prompt leaves under it.
  `[data-sidebar=landscape]${PROMPT_UP}:has(>[data-side-preview]:not(:empty)){display:grid;grid-template-columns:minmax(0,40%) minmax(0,1fr);grid-template-rows:fit-content(72%) minmax(0,1fr) auto auto}`,
  `[data-sidebar=landscape]${PROMPT_UP}>[data-side-preview]:not(:empty){grid-column:1;grid-row:1/3;max-height:none;padding:8px 4px 8px 8px}`,
  `[data-sidebar=landscape]${PROMPT_UP}:has(>[data-side-preview]:not(:empty))>[data-side-dock]{grid-column:2;grid-row:1;max-height:none;border-top-width:0}`,
  `[data-sidebar=landscape]${PROMPT_UP}:has(>[data-side-preview]:not(:empty))>[data-side-feed]{grid-column:2;grid-row:2}`,
  `[data-sidebar=landscape]${PROMPT_UP}:has(>[data-side-preview]:not(:empty))>[data-side-status]{grid-column:1/3;grid-row:3}`,
  `[data-sidebar=landscape]${PROMPT_UP}:has(>[data-side-preview]:not(:empty))>[data-side-actions]{grid-column:1/3;grid-row:4}`,
  `[data-portrait-dock][data-feed-off]>[data-portrait-feed]{display:none}`,
  `[data-portrait-dock][data-feed-off]>[data-side-dock],[data-portrait-dock][data-feed-off] :is([data-dock-fill],[data-docked-banner],[data-prompt-body]){flex-grow:1}`,
  // A short portrait dock (a small phone): the banner's padding tightens, so its title and
  // hint read above the buttons beside the preview.
  `[data-portrait-dock][data-short] [data-docked-banner]{padding-top:7px;padding-bottom:7px}`,
  `[data-portrait-dock][data-short] [data-prompt-title]{font-size:15px}`,
  `[data-portrait-dock][data-short] [data-prompt-hint]{font-size:12px;line-height:1.3}`,
  // A portrait prompt's text, when it scrolls above the buttons, fades out at the cut instead of a half line
  `[data-portrait-dock] [data-prompt-body]{padding-bottom:6px;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 10px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 10px),transparent)}`,
  `[data-portrait-dock][data-short] [data-prompt-actions]{margin-top:4px;margin-bottom:-7px;padding-top:4px;padding-bottom:7px}`,
  `[data-portrait-dock][data-short] [data-prompt-actions]>button{height:32px}`,
  // Portrait: the prompt is a column of its own that never scrolls as a whole. Its title and
  // hint scroll inside it when the dock is short, and its buttons stay below them in the flow
  // (not stuck over the text). The prompt never gives way to the feed: the feed takes what is left.
  `[data-portrait-dock]>[data-side-dock]{overflow:hidden;display:flex;flex-direction:column}`,
  `[data-portrait-dock] [data-dock-fill]{flex-shrink:1;min-height:0}`,
  `[data-portrait-dock] [data-docked-banner]{flex:0 1 auto;min-height:0}`,
  `[data-portrait-dock] [data-docked-banner]>[data-prompt-body]{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}`,
  `[data-portrait-dock] [data-docked-banner]>[data-prompt-actions]{position:static;flex:none;box-shadow:none}`,
  `[data-portrait-dock] [data-dock-fill]>[id]{flex-shrink:1;min-height:0;overflow-y:auto}`,
  // The feed is shown whole or not at all: a strip too short for its header and one entry is hidden.
  `[data-portrait-feed]{container-type:size}`,
  `@container (max-height:${FEED_MIN_H - 1}px){[data-feed-box]{display:none}}`,
  `[data-side-status]:has(>[role=status]:empty):has(>[data-control-banner]:empty){min-height:0;height:0;padding:0;border-width:0;overflow:hidden}`,
  `[data-side-status]>[role=status]:empty{min-height:0;height:0}`,
].join("");

/** Below this a portrait dock has no room for a readable feed under a prompt. */
const SHORT_DOCK = 240;

/**
 * Portrait: under a docked prompt the feed shows only while it gets FEED_MIN_H; else the root
 * wears `data-feed-off` and the prompt grows into the space (SIDEBAR_CSS). Measured with the
 * attribute off each time, so the prompt's natural height decides, never its grown one; set on
 * the DOM directly (React never renders the attribute).
 */
function usePortraitFeedFit(rootRef: RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    const feed = root?.querySelector<HTMLElement>("[data-portrait-feed]");
    const dock = root?.querySelector<HTMLElement>("[data-side-dock]");
    const status = root?.querySelector<HTMLElement>("[data-side-status]");
    if (!on || !root || !feed || !dock || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      root.removeAttribute("data-feed-off");
      // only under a prompt: alone, the feed has the column (and hides itself when too short)
      if (dock.offsetHeight > 0 && feed.getBoundingClientRect().height < FEED_MIN_H) root.setAttribute("data-feed-off", "");
    };
    fit();
    const resize = new ResizeObserver(fit);
    for (const el of [root, dock, status]) if (el) resize.observe(el);
    // a new prompt (or new text in one) can change its height while the grown box stays put
    const mutate = new MutationObserver(fit);
    mutate.observe(dock, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
      root.removeAttribute("data-feed-off");
    };
  }, [rootRef, on]);
}

const at = (box: Box2D | undefined): CSSProperties | undefined =>
  box ? { position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h } : undefined;

/**
 * Everything beside the board that is not a seat: the prompt dock, the status line and the
 * actions — and, in landscape and on a desktop, the inspector around them.
 *
 * Landscape / wide: ONE panel surface beside the board, top to bottom:
 *   1. on a phone, the card preview, large and borderless (PreviewPanel2D), only while a card
 *      is previewed — a desktop places it in the left column instead, between the seats
 *      (`boxes.preview`), where it is never blank: the opponent's move as it happens, else
 *      the card being looked at;
 *   2. the prompt dock, only while a prompt is up (no empty box otherwise);
 *   3. the action feed (ActionFeed2D), filling what is left and scrolling;
 *   4. the status line (collapsed while silent) and 5. the actions, pinned to the bottom.
 * The preview (on a phone) and the feed share the height and give way when a prompt docks.
 *
 * Portrait: no panel. The row between the board and your bar is split: the card preview on
 * the left (its own box, borderless — the card being looked at, else the opponent's latest
 * play dimmed with a short caption), and on the right the status line, any prompt and the
 * action feed under it; the actions sit in their own box. Nothing floats over the board. The
 * tree is the same in both arrangements (same keyed pieces, same order), so rotating the
 * phone never remounts the preview, the prompt dock or the actions.
 *
 * `status` is the status area: the control banner (whose turn you are playing) above the
 * status line, both collapsing while silent.
 */
export default function Sidebar2D({
  sizing,
  dock,
  status,
  actions,
}: {
  sizing: Board2DSizing;
  dock: ReactNode;
  status: ReactNode;
  actions: ReactNode;
}) {
  const side = sizing.boxes.side;
  const wide = sizing.layout === "wide";
  const pad = wide ? "px-3.5" : "px-2";
  // Portrait has no panel: the column sits in the dock's box (status on top via `order`, then
  // the prompt, then the feed) and the actions are placed absolutely in their own box, so the
  // keyed children — and with them a half-made prompt — are the same in both arrangements.
  const box = side ?? sizing.boxes.dock;
  // the boxes placed outside the column (portrait's actions and preview, a desktop's preview in
  // the left column), relative to the column's own box
  const within = (b: Box2D | undefined) => (b && box ? { ...b, x: b.x - box.x, y: b.y - box.y } : undefined);
  const actionsBox = within(sizing.boxes.actions);
  const previewBox = within(sizing.boxes.preview);
  const rootRef = useRef<HTMLDivElement>(null);
  usePortraitFeedFit(rootRef, !side);
  return (
    <div
      ref={rootRef}
      data-sidebar={side ? sizing.layout : undefined}
      data-portrait-dock={side ? undefined : ""}
      data-short={!side && (box?.h ?? 0) < SHORT_DOCK ? "" : undefined}
      aria-label={side ? "Inspector" : undefined}
      role={side ? "complementary" : undefined}
      style={at(box)}
      className={
        side
          ? // the desktop's preview sits outside the panel (left column): the panel must not clip it
            `flex flex-col rounded-rc-lg border border-rc-line/10 bg-[linear-gradient(180deg,rgb(12,16,30)_0%,rgb(9,12,22)_100%)] shadow-[0_10px_40px_rgba(0,0,0,0.45)] ${
              previewBox ? "" : "overflow-hidden"
            }`
          : "flex flex-col gap-1"
      }
    >
      <style>{SIDEBAR_CSS}</style>
      <div
        key="preview"
        data-side-preview={side && !previewBox ? "" : undefined}
        data-portrait-preview={side ? undefined : ""}
        className={
          previewBox ? `absolute overflow-hidden ${side ? "py-2" : ""}` : "max-h-[64%] min-h-0 flex-[1.8_1_0] px-2 pb-1 pt-2 empty:hidden"
        }
        style={previewBox ? { left: previewBox.x, top: previewBox.y, width: previewBox.w, height: previewBox.h } : undefined}
      >
        {/* a phone's landscape column shows a card only while one is looked at (height is
            precious there); portrait and the desktop are never blank */}
        <PreviewPanel2D quiet={wide || !side} compact={!side} />
      </div>
      <div
        key="dock"
        data-side-dock=""
        data-dock-flat={side ? "" : undefined}
        // it may shrink below its content (and scroll) so the feed and actions are never pushed out
        className={`thin-scrollbar min-h-0 flex-[0_1_auto] overflow-y-auto overscroll-contain ${
          side ? (wide ? "max-h-[58%] rounded-t-rc-lg" : "max-h-[78%] border-t border-rc-line/10") : ""
        }`}
      >
        {dock}
      </div>
      <div
        key="feed"
        data-portrait-feed={side ? undefined : ""}
        data-side-feed={side ? "" : undefined}
        className={
          side
            ? `flex flex-col border-t border-rc-line/10 ${wide ? "min-h-[180px] flex-[1_1_0]" : "min-h-0 flex-[1_1_0]"}`
            : "flex min-h-0 flex-[1_1_0] flex-col"
        }
      >
        {side ? (
          <ActionFeed2D compact={!wide} title={wide} />
        ) : (
          <div data-feed-box="" className="flex h-full min-h-0 flex-col overflow-hidden rounded-rc-md border border-rc-line/10 bg-[rgba(9,13,25,0.85)]">
            <ActionFeed2D compact title={false} />
          </div>
        )}
      </div>
      <div
        key="status"
        data-side-status=""
        className={
          side
            ? `flex flex-none flex-col justify-center gap-1 border-t border-rc-line/10 px-1.5 py-1 ${wide ? "min-h-[36px]" : "min-h-[24px]"}`
            : "-order-1 flex flex-none flex-col gap-1 overflow-hidden"
        }
      >
        {status}
      </div>
      <div
        key="actions"
        data-side-actions={side ? "" : undefined}
        className={side ? `flex-none ${pad} ${wide ? "pb-3 pt-2" : "pb-1.5 pt-1"}` : "absolute flex flex-col justify-center"}
        style={actionsBox ? { left: actionsBox.x, top: actionsBox.y, width: actionsBox.w, height: actionsBox.h } : undefined}
      >
        {actions}
      </div>
    </div>
  );
}
