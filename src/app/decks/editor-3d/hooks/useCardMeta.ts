"use client";

import { useEffect, useState } from "react";
import type { CardMeta, Pick3D } from "@/lib/game/cardSorting";

export default function useCardMeta(
  yourCounts: Array<{ cardId: number }>,
  pick3D: Pick3D[],
  setName: string,
  isSealed: boolean
) {
  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>({});

  useEffect(() => {
    const ids = new Set<number>();
    for (const c of yourCounts) ids.add(c.cardId);
    for (const p of pick3D) ids.add(p.card.cardId);
    if (ids.size === 0) {
      setMetaByCardId({});
      return;
    }

    const idArr = Array.from(ids);
    const perChunk = 100;
    const chunks: number[][] = [];
    for (let i = 0; i < idArr.length; i += perChunk) {
      chunks.push(idArr.slice(i, i + perChunk));
    }

    // In sealed mode, we don’t constrain by set; otherwise, use selected set
    const sets = isSealed
      ? Array.from(
          new Set(
            pick3D
              .map((p) => p.card.setName)
              .filter((s): s is string => !!s)
          )
        )
      : [setName];

    let cancelled = false;
    Promise.all(
      sets.flatMap((s) =>
        chunks.map(async (chunk) => {
          const res = await fetch(
            `/api/cards/meta?ids=${chunk.join(",")}&set=${encodeURIComponent(
              s
            )}`,
            { cache: "no-store" }
          );
          const rows = (await res.json()) as Array<{
            cardId: number;
            cost: number | null;
            thresholds: Record<string, number> | null;
            attack: number | null;
            defence: number | null;
          }>;
          return rows;
        })
      )
    )
      .then((parts) => {
        if (cancelled) return;
        const next: Record<number, CardMeta> = {};
        for (const rows of parts) {
          for (const m of rows) {
            next[m.cardId] = {
              cost: m.cost,
              thresholds: m.thresholds,
              attack: m.attack,
              defence: m.defence,
            };
          }
        }
        setMetaByCardId(next);
      })
      .catch(() => {
        if (!cancelled) setMetaByCardId({});
      });

    return () => {
      cancelled = true;
    };
  }, [yourCounts, pick3D, setName, isSealed]);

  return metaByCardId;
}

