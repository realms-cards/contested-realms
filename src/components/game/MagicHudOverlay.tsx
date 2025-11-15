"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import {
  getCellNumber,
  seatFromOwner,
  opponentSeat,
} from "@/lib/game/store/utils/boardHelpers";

export default function MagicHudOverlay() {
  const pendingMagic = useGameStore((s) => s.pendingMagic);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);

  const setMagicCasterChoice = useGameStore((s) => s.setMagicCasterChoice);
  const setMagicTargetChoice = useGameStore((s) => s.setMagicTargetChoice);
  const confirmMagic = useGameStore((s) => s.confirmMagic);
  const resolveMagic = useGameStore((s) => s.resolveMagic);
  const cancelMagic = useGameStore((s) => s.cancelMagic);

  if (!pendingMagic) return null;

  const ownerSeat = seatFromOwner(pendingMagic.spell.owner);
  const actorIsActive = ownerSeat
    ? ((actorKey === "p1" && currentPlayer === 1) ||
        (actorKey === "p2" && currentPlayer === 2)) &&
      actorKey === ownerSeat
    : true;

  // Always show overlay for both seats while a spell is pending.

  const tileNum = pendingMagic
    ? getCellNumber(pendingMagic.tile.x, pendingMagic.tile.y, board.size.w)
    : null;
  const cardName = (() => {
    try {
      return pendingMagic.spell.card?.name || "Magic";
    } catch {
      return "Magic";
    }
  })();
  const status = pendingMagic.status;
  const getPermanentName = (
    at: string,
    index?: number | null | undefined
  ): string => {
    if (typeof index !== "number") return "Permanent";
    return permanents?.[at]?.[index]?.card?.name || "Permanent";
  };

  // actorIsActive computed above

  function TopBar() {
    const defenderSeat = ownerSeat ? opponentSeat(ownerSeat) : null;
    const iAmDefender = defenderSeat && actorKey === defenderSeat;

    const pm = pendingMagic as NonNullable<typeof pendingMagic>;

    const targetNameForText = (() => {
      const t = pm.target;
      if (!t) return null as string | null;
      if (t.kind === "location") return String(t.at);
      if (t.kind === "permanent") {
        try {
          return permanents?.[t.at]?.[t.index]?.card?.name || "Permanent";
        } catch {}
        return "Permanent";
      }
      if (t.kind === "avatar") {
        return `Avatar ${t.seat.toUpperCase()}`;
      }
      if (t.kind === "projectile") {
        if (t.intended) {
          if (t.intended.kind === "permanent") {
            try {
              return (
                permanents?.[t.intended.at]?.[t.intended.index]?.card?.name ||
                "Permanent"
              );
            } catch {}
            return "Permanent";
          }
          return `Avatar ${t.intended.seat.toUpperCase()}`;
        }
        if (t.firstHit) {
          if (t.firstHit.kind === "permanent") {
            return getPermanentName(t.firstHit.at, t.firstHit.index);
          }
          // Map avatar seat from cell if possible
          const seatByCell: Record<string, "p1" | "p2"> = (() => {
            const map: Record<string, "p1" | "p2"> = {};
            try {
              const p1 = avatars?.p1?.pos;
              if (Array.isArray(p1)) map[`${p1[0]},${p1[1]}`] = "p1";
            } catch {}
            try {
              const p2 = avatars?.p2?.pos;
              if (Array.isArray(p2)) map[`${p2[0]},${p2[1]}`] = "p2";
            } catch {}
            return map;
          })();
          const seat = seatByCell[t.firstHit.at];
          return seat ? `Avatar ${seat.toUpperCase()}` : "Avatar";
        }
      }
      return null as string | null;
    })();

    const stepsText = (() => {
      // For the non-active defending player, once a target is chosen,
      // show an explicit "Spell targets Target" sentence.
      if (
        !actorIsActive &&
        iAmDefender &&
        pm.target &&
        (status === "choosingTarget" || status === "confirm")
      ) {
        const tn = targetNameForText;
        if (tn) {
          // Tile prefix [T#] is rendered outside stepsText; keep only the
          // "Spell" targets "Target" portion here.
          return `"${cardName}" targets "${tn}"`;
        }
      }

      if (status === "choosingCaster") return `Select a Spellcaster`;
      if (status === "choosingTarget") return `Select a target`;
      if (status === "confirm") return `Cast ${cardName}`;
      if (status === "resolving") return `Resolving ${cardName}…`;
      return `Casting ${cardName}`;
    })();

    const casterChip = (() => {
      const c = pm.caster;
      if (!c) return null;
      if (c.kind === "avatar")
        return (
          <span className="px-2 py-0.5 rounded bg-white/10">
            Caster: Avatar {c.seat.toUpperCase()}
          </span>
        );
      if (c.kind === "permanent") {
        try {
          const name =
            permanents?.[c.at]?.[Number(c.index)]?.card?.name || null;
          const at = c.at;
          return (
            <span className="px-2 py-0.5 rounded bg-white/10">
              Caster: {name ? name : "Permanent"} @{at}
            </span>
          );
        } catch {}
        return (
          <span className="px-2 py-0.5 rounded bg-white/10">
            Caster: Permanent @{c.at}
          </span>
        );
      }
      return null;
    })();
    const cardChip = (
      <span className="px-2 py-0.5 rounded bg-white/10">Spell: {cardName}</span>
    );
    const targetChip = (() => {
      const t = pm.target;
      if (!t) return null;
      if (t.kind === "location")
        return (
          <span className="px-2 py-0.5 rounded bg-white/10">
            Target: {t.at}
          </span>
        );
      if (t.kind === "permanent") {
        const nm = permanents?.[t.at]?.[t.index]?.card?.name || "Permanent";
        return (
          <span className="px-2 py-0.5 rounded bg-white/10">Target: {nm}</span>
        );
      }
      if (t.kind === "avatar")
        return (
          <span className="px-2 py-0.5 rounded bg-white/10">
            Target: Avatar {t.seat.toUpperCase()}
          </span>
        );
      if (t.kind === "projectile") {
        let label: string | null = null;
        if (t.intended) {
          if (t.intended.kind === "permanent")
            label =
              permanents?.[t.intended.at]?.[t.intended.index]?.card?.name ||
              "Permanent";
          else label = `Avatar ${t.intended.seat.toUpperCase()}`;
        } else if (t.firstHit) {
          if (t.firstHit.kind === "permanent") {
            label = getPermanentName(t.firstHit.at, t.firstHit.index);
          } else {
            // map avatar seat from cell if possible
            const seatByCell: Record<string, "p1" | "p2"> = (() => {
              const map: Record<string, "p1" | "p2"> = {};
              try {
                const p1 = avatars?.p1?.pos;
                if (Array.isArray(p1)) map[`${p1[0]},${p1[1]}`] = "p1";
              } catch {}
              try {
                const p2 = avatars?.p2?.pos;
                if (Array.isArray(p2)) map[`${p2[0]},${p2[1]}`] = "p2";
              } catch {}
              return map;
            })();
            const seat = seatByCell[t.firstHit.at];
            label = seat ? `Avatar ${seat.toUpperCase()}` : "Avatar";
          }
        }
        return (
          <span className="px-2 py-0.5 rounded bg-white/10">
            {label ? (
              <>
                Target: {label}{" "}
                <span className="opacity-70">({t.direction})</span>
              </>
            ) : (
              <>Direction: {t.direction}</>
            )}
          </span>
        );
      }
      return null;
    })();

    return (
      <div className="fixed inset-x-0 top-6 z-40 pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-white/20 shadow-lg text-lg md:text-xl flex items-center gap-2 select-none">
          <span className="opacity-80">
            {tileNum ? `[T${tileNum}] ` : ""}
            <span className="font-fantaisie">{stepsText}</span>
          </span>
          {/* Always show target chip when available, hide other chips on mobile */}
          {targetChip && (
            <span className="inline-flex items-center gap-2 text-sm opacity-90">
              {targetChip}
            </span>
          )}
          <span className="hidden md:inline-flex items-center gap-2 text-sm opacity-90">
            {casterChip}
            {cardChip}
          </span>
          {actorIsActive && status === "choosingTarget" ? (
            <>
              {pm.target ? (
                <button
                  className="mx-1 rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1 select-none"
                  onClick={() => {
                    try {
                      confirmMagic();
                    } catch {}
                  }}
                >
                  Confirm
                </button>
              ) : null}
              <button
                className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
                onClick={() => setMagicCasterChoice(null)}
              >
                Back
              </button>
            </>
          ) : null}
          {actorIsActive && status === "confirm" ? (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={() => setMagicTargetChoice(null)}
            >
              Back
            </button>
          ) : null}
          {!actorIsActive && iAmDefender && status === "confirm" ? (
            <button
              className="mx-1 rounded bg-amber-600/90 hover:bg-amber-500 px-3 py-1 select-none"
              onClick={() => resolveMagic()}
            >
              Resolve
            </button>
          ) : null}
          {actorIsActive ? (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={() => cancelMagic()}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function SummaryCard() {
    const pm = pendingMagic;
    if (!pm || pm.status !== "confirm") return null;
    const textRaw = pm.summaryText;
    const text = typeof textRaw === "string" ? textRaw.trim() : textRaw;
    const tileNo = getCellNumber(pm.tile.x, pm.tile.y, board.size.w);
    const t = pm.target;
    const seatByCell: Record<string, "p1" | "p2"> = (() => {
      const map: Record<string, "p1" | "p2"> = {};
      try {
        const p1 = avatars?.p1?.pos;
        if (Array.isArray(p1)) map[`${p1[0]},${p1[1]}`] = "p1";
      } catch {}
      try {
        const p2 = avatars?.p2?.pos;
        if (Array.isArray(p2)) map[`${p2[0]},${p2[1]}`] = "p2";
      } catch {}
      return map;
    })();

    const targetLabel = (() => {
      if (!t) return "";
      if (t.kind === "projectile") {
        let label = "";
        if (t.intended) {
          if (t.intended.kind === "permanent") {
            const nm =
              permanents?.[t.intended.at]?.[t.intended.index]?.card?.name ||
              "Permanent";
            label = `-> ${nm} (${t.direction})`;
          } else {
            label = `-> Avatar ${t.intended.seat.toUpperCase()} (${
              t.direction
            })`;
          }
        } else if (t.firstHit) {
          if (t.firstHit.kind === "permanent") {
            const nm = getPermanentName(t.firstHit.at, t.firstHit.index);
            label = `-> ${nm} (${t.direction})`;
          } else {
            const seatByCell: Record<string, "p1" | "p2"> = (() => {
              const map: Record<string, "p1" | "p2"> = {};
              try {
                const p1 = avatars?.p1?.pos;
                if (Array.isArray(p1)) map[`${p1[0]},${p1[1]}`] = "p1";
              } catch {}
              try {
                const p2 = avatars?.p2?.pos;
                if (Array.isArray(p2)) map[`${p2[0]},${p2[1]}`] = "p2";
              } catch {}
              return map;
            })();
            const seat = seatByCell[t.firstHit.at];
            label = `-> ${seat ? `Avatar ${seat.toUpperCase()}` : "Avatar"} (${
              t.direction
            })`;
          }
        } else {
          label = `-> ${t.direction}`;
        }
        return label;
      }
      if (t.kind === "permanent") {
        const nm = permanents?.[t.at]?.[t.index]?.card?.name || "Permanent";
        return `-> ${nm}`;
      }
      if (t.kind === "avatar") return `-> Avatar ${t.seat.toUpperCase()}`;
      if (t.kind === "location") return `-> ${t.at}`;
      return "";
    })();

    const projectileMismatchWarning = (() => {
      if (!t || t.kind !== "projectile" || !t.intended || !t.firstHit)
        return null;
      // compare intended vs firstHit
      let mismatch = false;
      if (t.intended.kind === "permanent") {
        mismatch = !(
          t.firstHit.kind === "permanent" &&
          t.firstHit.at === t.intended.at &&
          t.firstHit.index === t.intended.index
        );
      } else {
        // intended avatar: try to match seat via position
        const seatAt = (() => {
          try {
            if (t.intended.kind !== "avatar") return null;
            const pos = avatars?.[t.intended.seat]?.pos;
            if (Array.isArray(pos)) return `${pos[0]},${pos[1]}`;
          } catch {}
          return null;
        })();
        mismatch = !(
          t.firstHit.kind === "avatar" &&
          seatAt &&
          t.firstHit.at === seatAt
        );
      }
      if (!mismatch) return null;
      // Build names for message
      const intendedName =
        t.intended.kind === "permanent"
          ? getPermanentName(t.intended.at, t.intended.index)
          : `Avatar ${t.intended.seat.toUpperCase()}`;
      let hitName = "something";
      if (t.firstHit.kind === "permanent") {
        hitName = getPermanentName(t.firstHit.at, t.firstHit.index) || "a unit";
      } else {
        const seat = seatByCell[t.firstHit.at];
        hitName = seat ? `Avatar ${seat.toUpperCase()}` : "an avatar";
      }
      return (
        <div className="mt-2 text-amber-300/90 text-sm">
          Warning: projectile will hit {hitName} first and may not reach{" "}
          {intendedName}.
        </div>
      );
    })();
    const cardName = (() => {
      try {
        return pm.spell.card?.name || "Magic";
      } catch {
        return "Magic";
      }
    })();
    return (
      <div className="fixed inset-x-0 top-24 z-40 pointer-events-none flex justify-center px-4">
        <div className="pointer-events-auto max-w-3xl w-full rounded-xl bg-black/85 text-white ring-1 ring-white/20 shadow-xl p-4">
          <div className="text-base md:text-lg mb-2">
            <span className="font-fantaisie">{cardName}</span>
            <span className="opacity-75">&nbsp;[T{tileNo}]</span>
            {targetLabel ? (
              <span className="opacity-80">&nbsp;{targetLabel}</span>
            ) : null}
          </div>
          <div className="whitespace-pre-wrap leading-relaxed">
            {text === undefined
              ? "Loading rules…"
              : text && text.length > 0
              ? text
              : "No rules text available."}
          </div>
          {projectileMismatchWarning}
          {!actorIsActive ? (
            <div className="mt-3 text-xs opacity-70">
              Waiting for opponent to resolve…
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <TopBar />
      <SummaryCard />
    </>
  );
}
