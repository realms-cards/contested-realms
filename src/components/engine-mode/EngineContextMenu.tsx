"use client";

import { useEffect, useState } from "react";
import CpuCardPick from "@/components/game/CpuCardPick";
import { RcButton } from "@/components/ui/rc-button";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store/types";
import { getCardImageUrl } from "@/lib/utils/cdnUrl";
import { isDisabled } from "@sorcery/shared";

const MENU =
  "pointer-events-auto fixed z-[220] flex min-w-[180px] flex-col gap-1 rounded-rc-md border border-rc-line/22 bg-[rgba(7,10,20,0.95)] p-2 font-rc-sans text-sm text-rc-fg shadow-rc-panel";

interface UnitFacts {
  damage?: number;
  tapped?: boolean;
  statuses: string[];
}

/**
 * Right-click menu for engine matches, on the board's existing openContextMenu plumbing.
 * The engine owns the rules, so the sandbox actions (tap, counters, move to zone) don't
 * apply here; this menu is for looking things up: examine any card, browse open piles.
 */
export default function EngineContextMenu() {
  const contextMenu = useGameStore((s) => s.contextMenu);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);
  const game = useEngineSession((s) => s.game);
  useEngineSession((s) => s.rev);
  const arrangement = useEngineSession((s) => s.arrangement);
  const resetArrangement = useEngineSession((s) => s.resetArrangement);
  const [inspect, setInspect] = useState<{ card: CardRef; facts: UnitFacts | null } | null>(null);
  const inspectSite = /site/i.test(inspect?.card.type ?? "");
  const [browse, setBrowse] = useState<{ title: string; cards: CardRef[] } | null>(null);

  // close everything on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setInspect(null);
      setBrowse(null);
      closeContextMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeContextMenu]);

  if (!game) return null;

  const store = useGameStore.getState();
  const target = contextMenu?.target ?? null;

  /** The clicked card plus what the engine knows about it on the board. */
  const resolve = (): { card: CardRef; facts: UnitFacts | null } | null => {
    if (!target) return null;
    if (target.kind === "permanent") {
      const item = store.permanents[target.at]?.[target.index];
      if (!item) return null;
      const unit = game.units[item.instanceId ?? ""];
      return {
        card: item.card,
        facts: unit
          ? {
              damage: unit.damage || undefined,
              tapped: unit.tapped,
              // most disables are derived (Babbling Brook, Basilisk, auras…) and never set the flag
              statuses: (["stealth", "ward", "disabled", "silenced"] as const).filter((f) =>
                f === "disabled" ? Boolean(unit.disabled) || isDisabled(game, unit) : Boolean(unit[f]),
              ),
            }
          : null,
      };
    }
    if (target.kind === "avatar") {
      const card = store.avatars[target.who]?.card;
      if (!card) return null;
      const seat = target.who === "p1" ? HUMAN_SEAT : ((1 - HUMAN_SEAT) as 0 | 1);
      const unit = game.units[game.players[seat].avatarUnitId];
      return { card, facts: unit ? { damage: unit.damage || undefined, tapped: unit.tapped, statuses: [] } : null };
    }
    if (target.kind === "site") {
      const card = store.board.sites[`${target.x},${target.y}`]?.card;
      return card ? { card, facts: null } : null;
    }
    if (target.kind === "handCard") return { card: target.card, facts: null };
    return null;
  };

  const pileOf = (who: PlayerKey, from: "spellbook" | "atlas" | "graveyard" | "collection") => store.zones[who]?.[from] ?? [];
  const open = (cards: CardRef[], title: string) => {
    setBrowse({ title, cards });
    closeContextMenu();
  };

  /** The tile the menu was opened on, for "Reset layout" (the player's own card arrangement there). */
  const tileOf = (): string | null => {
    if (target?.kind === "permanent") return target.at;
    if (target?.kind === "site") return `${target.x},${target.y}`;
    if (target?.kind === "avatar") {
      const pos = store.avatars[target.who]?.pos;
      return pos ? `${pos[0]},${pos[1]}` : null;
    }
    return null;
  };
  const tile = tileOf();
  const arrangedHere = tile !== null && Object.values(arrangement).some((e) => e.at === tile);

  const resolved = target && target.kind !== "pile" && target.kind !== "tokenpile" && target.kind !== "gemToken" ? resolve() : null;
  const screen = contextMenu?.screen ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const style = {
    left: Math.min(screen.x, window.innerWidth - 220),
    top: Math.min(screen.y, window.innerHeight - 180),
  };

  return (
    <>
      {contextMenu && (
        <div className="fixed inset-0 z-[219]" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}>
          <div className={MENU} style={style} onClick={(e) => e.stopPropagation()}>
            {resolved && (
              <>
                <div className="px-1 font-rc-display text-rc-accent-link">{resolved.card.name}</div>
                <RcButton variant="ghost" size="xs" onClick={() => { setInspect(resolved); closeContextMenu(); }}>
                  Examine
                </RcButton>
              </>
            )}
            {target?.kind === "pile" && (target.from === "graveyard" || target.from === "collection") && (
              <RcButton
                variant="ghost"
                size="xs"
                onClick={() => open(pileOf(target.who, target.from), `${target.who === "p1" ? "Your" : "Computer's"} ${target.from} (${pileOf(target.who, target.from).length})`)}
              >
                Browse {target.from} ({pileOf(target.who, target.from).length})
              </RcButton>
            )}
            {target?.kind === "pile" && (target.from === "spellbook" || target.from === "atlas") && (
              <div className="px-1 py-0.5 text-xs text-rc-fg-muted">
                {pileOf(target.who, target.from).length} cards, face down
              </div>
            )}
            {arrangedHere && tile && (
              <RcButton variant="ghost" size="xs" onClick={() => { resetArrangement(tile); closeContextMenu(); }}>
                Reset layout
              </RcButton>
            )}
            {!resolved && target && target.kind !== "pile" && (
              <div className="px-1 py-0.5 text-xs text-rc-fg-muted">Nothing to inspect here.</div>
            )}
          </div>
        </div>
      )}

      {inspect && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[rgba(6,10,20,0.7)] p-4" onClick={() => setInspect(null)}>
          <div
            className={`flex max-h-[86vh] w-[min(92vw,640px)] flex-col gap-4 overflow-y-auto rounded-rc-lg ${inspectSite ? "" : "sm:flex-row"} border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-4 font-rc-sans text-rc-fg shadow-rc-panel thin-scrollbar`}
            onClick={(e) => e.stopPropagation()}
          >
            {inspect.card.slug && inspectSite ? (
              // sites are printed sideways: turned a quarter so they read the way they lie on the board
              <div className="relative aspect-[88/63] w-full max-w-[min(100%,calc(45vh*88/63))] shrink-0 self-center overflow-hidden rounded-rc-md shadow-rc-md ring-1 ring-rc-line/25">
                <img
                  src={getCardImageUrl(inspect.card.slug)}
                  alt={inspect.card.name}
                  className="absolute left-1/2 top-1/2 h-[calc(100%*88/63)] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90"
                />
              </div>
            ) : inspect.card.slug ? (
              <img src={getCardImageUrl(inspect.card.slug)} alt={inspect.card.name} className="max-h-[45vh] w-auto max-w-full shrink-0 self-center rounded-rc-md object-contain shadow-rc-md ring-1 ring-rc-line/25 sm:h-[340px] sm:max-h-none sm:max-w-[60%] sm:self-start" />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="font-rc-display text-[22px] leading-tight text-rc-fg-strong">{inspect.card.name}</div>
              <div className="font-rc-mono text-xs uppercase tracking-[0.08em] text-rc-fg-subtle">
                {inspect.card.type}
                {inspect.card.cost != null ? ` · cost ${inspect.card.cost}` : ""}
                {inspect.card.attack != null ? ` · ${inspect.card.attack}/${inspect.card.defence ?? 0}` : ""}
              </div>
              {inspect.facts && (
                <div className="text-sm text-rc-fg-muted">
                  {inspect.facts.tapped ? "Tapped. " : ""}
                  {inspect.facts.damage ? `${inspect.facts.damage} damage. ` : ""}
                  {inspect.facts.statuses.length ? `Statuses: ${inspect.facts.statuses.join(", ")}.` : ""}
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-rc-fg">{inspect.card.text ?? ""}</p>
              <div className="mt-auto flex justify-end">
                <RcButton variant="outline" size="sm" onClick={() => setInspect(null)}>
                  Close
                </RcButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {browse && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-[rgba(6,10,20,0.5)] p-4 pb-24" onClick={() => setBrowse(null)}>
          <div className="pointer-events-auto w-[min(92vw,880px)]" onClick={(e) => e.stopPropagation()}>
            <CpuCardPick title={browse.title} items={browse.cards.map((card, i) => ({ id: String(i), card }))} onPick={() => undefined} onClose={() => setBrowse(null)} />
          </div>
        </div>
      )}
    </>
  );
}
