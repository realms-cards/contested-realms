"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";

interface ContextMenuProps {
  onClose: () => void;
}

export default function ContextMenu({ onClose }: ContextMenuProps) {
  const contextMenu = useGameStore((s) => s.contextMenu);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const zones = useGameStore((s) => s.zones);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const toggleTapSite = useGameStore((s) => s.toggleTapSite);
  const toggleTapPermanent = useGameStore((s) => s.toggleTapPermanent);
  const toggleTapAvatar = useGameStore((s) => s.toggleTapAvatar);
  const moveSiteToZone = useGameStore((s) => s.moveSiteToZone);
  const movePermanentToZone = useGameStore((s) => s.movePermanentToZone);
  const transferSiteControl = useGameStore((s) => s.transferSiteControl);
  const transferPermanentControl = useGameStore(
    (s) => s.transferPermanentControl
  );
  const drawFromPileToHand = useGameStore((s) => s.drawFromPileToHand);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const shuffleSpellbook = useGameStore((s) => s.shuffleSpellbook);
  const shuffleAtlas = useGameStore((s) => s.shuffleAtlas);
  const openSearchDialog = useGameStore((s) => s.openSearchDialog);
  const openPlacementDialog = useGameStore((s) => s.openPlacementDialog);
  const addTokenToHand = useGameStore((s) => s.addTokenToHand);
  const attachTokenToTopPermanent = useGameStore((s) => s.attachTokenToTopPermanent);
  const detachToken = useGameStore((s) => s.detachToken);
  const log = useGameStore((s) => s.log);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null
  );

  useLayoutEffect(() => {
    if (!contextMenu) {
      setMenuPos(null);
      return;
    }

    const margin = 8;
    const sx = contextMenu.screen?.x ?? window.innerWidth / 2;
    const sy = contextMenu.screen?.y ?? window.innerHeight / 2;

    const compute = () => {
      const el = menuRef.current;
      const w = el?.offsetWidth ?? 224;
      const h = el?.offsetHeight ?? 200;
      const maxLeft = Math.max(margin, window.innerWidth - w - margin);
      const maxTop = Math.max(margin, window.innerHeight - h - margin);
      const left = Math.min(Math.max(sx, margin), maxLeft);
      const top = Math.min(Math.max(sy, margin), maxTop);
      setMenuPos({ left, top });
    };

    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [contextMenu]);

  if (!contextMenu) return null;

  const t = contextMenu.target;
  let header = "";
  let tapped = false;
  let hasToggle = false;
  let doToggle: (() => void) | null = null;
  let doToHand: (() => void) | null = null;
  let doToGY: (() => void) | null = null;
  let doToSpellbook: (() => void) | null = null;
  let doBanish: (() => void) | null = null;
  let doTransfer: (() => void) | null = null;
  let transferTo: 1 | 2 | null = null;
  let doDrawFromPile: (() => void) | null = null;
  let doShufflePile: (() => void) | null = null;
  let doAddToAtlas: (() => void) | null = null;
  let doSearchPile: (() => void) | null = null;
  let doAttachToken: (() => void) | null = null;
  let doDetachToken: (() => void) | null = null;

  if (t.kind === "site") {
    const key = `${t.x},${t.y}`;
    const site = board.sites[key];
    header = site?.card?.name || `Site #${t.y * board.size.w + t.x + 1}`;
    tapped = !!site?.tapped;
    hasToggle = true;
    doToggle = () => {
      toggleTapSite(t.x, t.y);
      onClose();
    };

    if (site) {
      transferTo = site.owner === 1 ? 2 : 1;
      doTransfer = () => {
        transferSiteControl(t.x, t.y);
        onClose();
      };
    }

    doToHand = () => {
      moveSiteToZone(t.x, t.y, "hand");
      onClose();
    };
    doToGY = () => {
      moveSiteToZone(t.x, t.y, "graveyard");
      onClose();
    };
    doBanish = () => {
      moveSiteToZone(t.x, t.y, "banished");
      onClose();
    };

    if (
      site?.card?.name &&
      (site.card?.type || "").toLowerCase().includes("site")
    ) {
      doAddToAtlas = () => {
        const cardName = site.card!.name;
        openPlacementDialog(cardName, "Atlas", (position) => {
          moveSiteToZone(t.x, t.y, "atlas", position);
        });
        onClose();
      };
    }
  } else if (t.kind === "permanent") {
    const arr = permanents[t.at] || [];
    const item = arr[t.index];
    header = item?.card?.name || "Permanent";
    tapped = !!item?.tapped;
    hasToggle = true;
    doToggle = () => {
      toggleTapPermanent(t.at, t.index);
      onClose();
    };

    if (item) {
      transferTo = item.owner === 1 ? 2 : 1;
      doTransfer = () => {
        transferPermanentControl(t.at, t.index);
        onClose();
      };
    }

    const isToken = (item?.card?.type || "").toLowerCase().includes("token");
    if (isToken) {
      const nonTokenIndices = arr
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => !((it.card.type || "").toLowerCase().includes("token")));
      if (item?.attachedTo) {
        doDetachToken = () => {
          detachToken(t.at, t.index);
          onClose();
        };
      } else if (nonTokenIndices.length > 0) {
        doAttachToken = () => {
          attachTokenToTopPermanent(t.at, t.index);
          onClose();
        };
      }
      doBanish = () => {
        movePermanentToZone(t.at, t.index, "banished");
        onClose();
      };
    } else {
      doToHand = () => {
        movePermanentToZone(t.at, t.index, "hand");
        onClose();
      };
      doToGY = () => {
        movePermanentToZone(t.at, t.index, "graveyard");
        onClose();
      };
      if (item?.card?.name) {
        doToSpellbook = () => {
          const cardName = item.card!.name;
          openPlacementDialog(cardName, "Spellbook", (position) => {
            movePermanentToZone(t.at, t.index, "spellbook", position);
          });
          onClose();
        };
      }
      doBanish = () => {
        movePermanentToZone(t.at, t.index, "banished");
        onClose();
      };
    }
  } else if (t.kind === "avatar") {
    const a = avatars[t.who];
    header = a?.card?.name || `${t.who.toUpperCase()} Avatar`;
    tapped = !!a?.tapped;
    hasToggle = true;
    doToggle = () => {
      toggleTapAvatar(t.who);
      onClose();
    };
  } else if (t.kind === "pile") {
    const pile: CardRef[] = zones[t.who][t.from];
    const count = pile.length;
    const name =
      t.from === "spellbook"
        ? "Spellbook"
        : t.from === "atlas"
        ? "Atlas"
        : "Cemetery";
    header = `${name} (${count} cards)`;
    const isCurrent = (t.who === "p1" ? 1 : 2) === currentPlayer;
    if (isCurrent && count > 0) {
      doDrawFromPile = () => {
        const top: CardRef = pile[0]!;
        setDragFromPile({ who: t.who, from: t.from, card: top });
        drawFromPileToHand();
        onClose();
      };
    }
    if (isCurrent && t.from !== "graveyard") {
      doShufflePile = () => {
        if (t.from === "spellbook") shuffleSpellbook(t.who);
        else shuffleAtlas(t.who);
        onClose();
      };
    }
    if (isCurrent && count > 0) {
      doSearchPile = () => {
        const displayName =
          t.from === "spellbook"
            ? "Spellbook"
            : t.from === "atlas"
            ? "Atlas"
            : "Cemetery";
        openSearchDialog(displayName, pile, (selectedCard) => {
          // Draw the selected card to hand
          setDragFromPile({ who: t.who, from: t.from, card: selectedCard });
          drawFromPileToHand();
        });
        // Log opening of search dialog for Spellbook/Atlas in yellow via PlayPage style
        if (t.from === "spellbook" || t.from === "atlas") {
          const whoDisplay = t.who.toUpperCase();
          log(`Search: ${whoDisplay} has looked at their ${displayName}`);
        }
        onClose();
      };
    }
  } else if (t.kind === "tokenpile") {
    header = "Tokens";
    const who = t.who;
    doSearchPile = () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TOKEN_DEFS, tokenSlug } = require("@/lib/game/tokens");
      const tokenCards = (TOKEN_DEFS || []).map((def: { name: string; key: string; size?: string }) => ({
        cardId: -1,
        variantId: null,
        name: def.name,
        type: "Token",
        slug: tokenSlug(def),
        thresholds: null,
      })) as CardRef[];
      openSearchDialog("Tokens", tokenCards, (selected) => {
        addTokenToHand(who, selected.name);
      });
      onClose();
    };
  }

  const label = tapped ? "Untap" : "Tap";

  return (
    <div
      className="absolute inset-0 z-30"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="absolute bg-zinc-900/90 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg p-3 w-56 text-white pointer-events-auto"
        style={{
          left: (menuPos?.left ?? contextMenu.screen?.x ?? 16) + "px",
          top: (menuPos?.top ?? contextMenu.screen?.y ?? 16) + "px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-sm font-semibold mb-2 truncate" title={header}>
            {header}
          </div>
          <div className="space-y-2">
            {hasToggle && doToggle && (
              <button
                className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                onClick={doToggle}
              >
                {label}
              </button>
            )}

            {doTransfer && (
              <button
                className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                onClick={doTransfer}
              >
                {`Transfer control${transferTo ? ` to P${transferTo}` : ""}`}
              </button>
            )}

            {(doAttachToken || doDetachToken) && (
              <div className="space-y-2">
                {doAttachToken && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doAttachToken}
                  >
                    Attach to permanent
                  </button>
                )}
                {doDetachToken && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doDetachToken}
                  >
                    Detach token
                  </button>
                )}
              </div>
            )}

            {(doToHand || doToGY || doToSpellbook || doBanish) && (
              <div className="space-y-2">
                {doToHand && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doToHand}
                  >
                    Move to Hand
                  </button>
                )}
                {doToGY && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doToGY}
                  >
                    Move to Cemetery
                  </button>
                )}
                {doToSpellbook && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doToSpellbook}
                  >
                    Move to Spellbook
                  </button>
                )}
                {doAddToAtlas && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doAddToAtlas}
                  >
                    Move to Atlas
                  </button>
                )}
                {doBanish && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doBanish}
                  >
                    Banish Card
                  </button>
                )}
              </div>
            )}

            {(doDrawFromPile || doShufflePile || doSearchPile) && (
              <div className="space-y-2">
                {doDrawFromPile && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doDrawFromPile}
                  >
                    Draw top
                  </button>
                )}
                {doSearchPile && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doSearchPile}
                  >
                    Search pile
                  </button>
                )}
                {doShufflePile && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doShufflePile}
                  >
                    Shuffle
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
