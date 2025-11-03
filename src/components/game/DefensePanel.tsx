"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useGameStore, type CellKey, type PlayerKey } from "@/lib/game/store";

export default function DefensePanel() {
  const pending = useGameStore((s) => s.pendingCombat);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const actorKey = useGameStore((s) => s.actorKey);
  const setDefenderSelection = useGameStore((s) => s.setDefenderSelection);
  const cancelCombat = useGameStore((s) => s.cancelCombat);
  const interactionGuides = useGameStore((s) => s.interactionGuides);
  const boardW = useGameStore((s) => s.board.size.w);

  const isOpen = useMemo(
    () => Boolean(pending && pending.status !== "resolved" && pending.status !== "cancelled"),
    [pending]
  );
  const defenderSeat: PlayerKey | null = (pending?.defenderSeat as PlayerKey | null) ?? null;
  const mySeat = actorKey;
  const show = Boolean(isOpen && pending && defenderSeat && mySeat === defenderSeat && interactionGuides);

  const cellKey: CellKey = pending ? (`${pending.tile.x},${pending.tile.y}` as CellKey) : ("0,0" as CellKey);
  const tileNumber = pending ? pending.tile.y * boardW + pending.tile.x + 1 : null;
  const myOwner: 1 | 2 = defenderSeat === "p1" ? 1 : 2;

  // Build list of candidates: friendly permanents at tile and friendly avatar at tile
  const candidates = useMemo(() => {
    if (!pending) return [] as Array<{ kind: "permanent" | "avatar"; at: CellKey; index: number; label: string; owner: 1 | 2; instanceId: string | null }>;
    const list: Array<{ kind: "permanent" | "avatar"; at: CellKey; index: number; label: string; owner: 1 | 2; instanceId: string | null }> = [];
    try {
      const items = permanents[cellKey] || [];
      items.forEach((p, i) => {
        if (!p) return;
        if (p.owner !== myOwner) return;
        const name = p.card?.name || "Unit";
        list.push({ kind: "permanent", at: cellKey, index: i, owner: p.owner as 1 | 2, instanceId: p.instanceId ?? null, label: name });
      });
    } catch {}
    try {
      const avSeat: PlayerKey = myOwner === 1 ? "p1" : "p2";
      const av = avatars?.[avSeat];
      if (av && Array.isArray(av.pos) && av.pos.length === 2) {
        const [ax, ay] = av.pos;
        if (ax === pending.tile.x && ay === pending.tile.y) {
          const name = av.card?.name || "Avatar";
          list.push({ kind: "avatar", at: cellKey, index: -1, owner: myOwner, instanceId: null, label: name });
        }
      }
    } catch {}
    return list;
  }, [pending, permanents, avatars, cellKey, myOwner]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [pending?.id]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onDone = () => {
    const chosen = candidates
      .filter((c) => selected.has(`${c.kind}:${c.at}:${c.index}`))
      .map((c) => ({ at: c.at, index: c.index, owner: c.owner as 1 | 2, instanceId: c.instanceId ?? null }));
    setDefenderSelection(chosen);
  };

  if (!show) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40 pointer-events-auto">
      <div className="rounded-xl bg-black/70 backdrop-blur text-white ring-1 ring-white/10 px-4 py-3 w-[min(92vw,560px)]">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold">Defend Tile {tileNumber ? `#${tileNumber}` : ""}</div>
        </div>
        {pending?.target ? (
          <div className="text-xs text-zinc-300 mb-2">
            Attacker is targeting {(() => {
              const t = pending.target;
              if (!t) return "";
              if (t.kind === "site") return "your site";
              if (t.kind === "avatar") return "your avatar";
              // permanent: attempt to display card name
              const list = permanents[cellKey] || [];
              const p = (t.index != null && list[t.index]) ? list[t.index] : null;
              return p?.card?.name ? `"${p.card.name}"` : "a unit";
            })()}
          </div>
        ) : null}
        {candidates.length === 0 ? (
          <div className="text-xs opacity-80">No defenders on this tile. You can drag units here during the window to include them, then click Done.</div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-2">
            {candidates.map((c) => {
              const key = `${c.kind}:${c.at}:${c.index}`;
              const active = selected.has(key);
              return (
                <button
                  key={key}
                  className={`text-xs rounded px-2 py-1 ring-1 ${active ? "bg-emerald-600/90 ring-emerald-400" : "bg-white/10 hover:bg-white/20 ring-white/20"}`}
                  aria-pressed={active}
                  onClick={() => toggle(key)}
                >
                  {active ? "✓ " : ""}{c.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="text-xs rounded bg-white/15 hover:bg-white/25 px-3 py-1" onClick={() => cancelCombat()}>Cancel</button>
          <button className="text-xs rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
