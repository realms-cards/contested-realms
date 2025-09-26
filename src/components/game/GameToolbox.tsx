"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import HandPeekDialog from "@/components/game/HandPeekDialog";
import D20Dice from "@/lib/game/components/D20Dice";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { generateInteractionRequestId, type InteractionRequestKind } from "@/lib/net/interactions";

export type GameToolboxProps = {
  myPlayerId: string | null;
  mySeat: PlayerKey | null;
  opponentPlayerId?: string | null;
  opponentSeat?: PlayerKey | null;
  matchId?: string | null;
};

export default function GameToolbox({
  myPlayerId,
  mySeat,
  opponentPlayerId = null,
  opponentSeat = null,
  matchId = null,
}: GameToolboxProps) {
  const zones = useGameStore((s) => s.zones);
  const drawFrom = useGameStore((s) => s.drawFrom);
  const drawFromBottom = useGameStore((s) => s.drawFromBottom);
  const log = useGameStore((s) => s.log);
  const sendInteraction = useGameStore((s) => s.sendInteractionRequest);
  const interactionLog = useGameStore((s) => s.interactionLog);

  const isOnline = !!myPlayerId && !!matchId && !!opponentPlayerId && !!opponentSeat;

  // UI state
  const [open, setOpen] = useState(false);
  const [drawSeat, setDrawSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [drawPile, setDrawPile] = useState<"spellbook" | "atlas">("spellbook");
  const [drawCount, setDrawCount] = useState<number>(1);
  const [drawFromWhere, setDrawFromWhere] = useState<"top" | "bottom">("top");

  const [peekSeat, setPeekSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [peekPile, setPeekPile] = useState<"spellbook" | "atlas">("spellbook");
  const [peekCount, setPeekCount] = useState<number>(3);
  const [peekFromWhere, setPeekFromWhere] = useState<"top" | "bottom">("top");

  // Toolbox D20 overlay state
  const [d20Open, setD20Open] = useState(false);
  const [d20Rolling, setD20Rolling] = useState(false);
  const [d20Value, setD20Value] = useState<number | null>(null);

  // Burrow/Submerge (forced)
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const permanents = useGameStore((s) => s.permanents);
  const setPermanentAbility = useGameStore((s) => s.setPermanentAbility);
  const setPermanentPosition = useGameStore((s) => s.setPermanentPosition);
  const updatePermanentState = useGameStore((s) => s.updatePermanentState);

  // Peek dialog from central store (populated by interaction:result)
  const peekDialog = useGameStore((s) => s.peekDialog);
  const closePeekDialog = useGameStore((s) => s.closePeekDialog);

  // Track pending permission requests we initiated so we can react on approval
  const pendingRequestRef = useRef<
    Record<
      string,
      | { kind: "inspectHand"; seat: PlayerKey }
      | {
          kind: "takeFromPile";
          seat: PlayerKey;
          pile: "spellbook" | "atlas";
          count: number;
          from: "top" | "bottom";
        }
    >
  >({});

  // When interactionLog updates, check approvals; actual reveals will come via interaction:result
  useEffect(() => {
    for (const rid of Object.keys(pendingRequestRef.current)) {
      const entry = interactionLog[rid];
      if (!entry || entry.status !== "approved") continue;
      // Remove handled request (actual reveal will arrive via interaction:result)
      const next = { ...pendingRequestRef.current } as Record<string, unknown>;
      delete next[rid];
      pendingRequestRef.current = next as typeof pendingRequestRef.current;
    }
  }, [interactionLog, zones]);

  // Helpers
  function requireOnlineIds(): { from: string; to: string; mid: string } | null {
    if (!isOnline || !myPlayerId || !matchId || !opponentPlayerId) return null;
    return { from: myPlayerId, to: opponentPlayerId, mid: matchId };
  }

  function requestConsent(kind: InteractionRequestKind, note: string, payload: Record<string, unknown>) {
    const ids = requireOnlineIds();
    if (!ids) return null;
    const requestId = generateInteractionRequestId("tool");
    sendInteraction({
      requestId,
      from: ids.from,
      to: ids.to,
      kind,
      matchId: ids.mid,
      note,
      payload,
    });
    return requestId;
  }

  // Actions
  const handleDraw = () => {
    const seat = drawSeat;
    if (isOnline && mySeat && seat !== mySeat) {
      // Drawing opponent's pile online is not supported yet (requires server-side action)
      log("[Warning] Drawing from opponent pile online is not supported");
      return;
    }
    if (drawFromWhere === "top") {
      drawFrom(seat, drawPile, Math.max(1, Math.floor(drawCount)));
    } else {
      drawFromBottom(seat, drawPile, Math.max(1, Math.floor(drawCount)));
    }
  };

  const handlePeekPile = () => {
    const seat = peekSeat;
    const pile = peekPile;
    const cnt = Math.max(1, Math.floor(peekCount));
    const from = peekFromWhere;
    if (isOnline) {
      // Always request and wait for interaction:result to open dialog
      const rid = requestConsent(
        "takeFromPile",
        `Request to look at ${cnt} from ${from} of ${pile}`,
        { seat, pile, count: cnt, from }
      );
      if (rid) {
        pendingRequestRef.current[rid] = { kind: "takeFromPile", seat, pile, count: cnt, from };
      }
      return;
    }
    // Offline/hotseat fallback: open immediately
    const cards = pile === "spellbook" ? zones[seat]?.spellbook || [] : zones[seat]?.atlas || [];
    const slice = from === "top" ? cards.slice(0, cnt) : cards.slice(Math.max(0, cards.length - cnt));
    useGameStore.getState().openPeekDialog(
      `${seat.toUpperCase()} ${pile === "spellbook" ? "Spellbook" : "Atlas"} (${from})`,
      slice
    );
  };

  const handleInspectOpponentHand = () => {
    if (!opponentSeat) {
      // Offline: show the other seat from mySeat else default to p2
      const seat: PlayerKey = mySeat === "p1" ? "p2" : "p1";
      const cards = zones[seat]?.hand || [];
      useGameStore.getState().openPeekDialog(`${seat.toUpperCase()} Hand`, [...cards]);
      return;
    }
    if (isOnline) {
      const rid = requestConsent("inspectHand", "Request to inspect hand", { seat: opponentSeat });
      if (rid) {
        pendingRequestRef.current[rid] = { kind: "inspectHand", seat: opponentSeat };
      }
    } else {
      const cards = zones[opponentSeat]?.hand || [];
      useGameStore.getState().openPeekDialog(`${opponentSeat.toUpperCase()} Hand`, [...cards]);
    }
  };

  const handleForcePosition = (target: "burrowed" | "submerged" | "surface") => {
    const sel = selectedPermanent;
    if (!sel) {
      log("Select a permanent on the board first");
      return;
    }
    const [xStr] = sel.at.split(",");
    const owner = permanents[sel.at]?.[sel.index]?.owner ?? 1;
    const seat: PlayerKey = owner === 1 ? "p1" : "p2";

    const apply = () => {
      // Ensure ability and position exist, then update
      const permanentId = permanents[sel.at]?.[sel.index]?.card?.cardId ?? (parseInt(xStr) * 1000 + sel.index);
      setPermanentAbility(permanentId, {
        permanentId,
        canBurrow: true,
        canSubmerge: true,
        requiresWaterSite: false,
        abilitySource: "Toolbox override",
      });
      if (!useGameStore.getState().permanentPositions[permanentId]) {
        setPermanentPosition(permanentId, {
          permanentId,
          state: "surface",
          position: { x: 0, y: 0, z: 0 },
        });
      }
      updatePermanentState(permanentId, target);
      log(`Forced ${target} state applied`);
    };

    if (isOnline && mySeat && seat !== mySeat) {
      const rid = requestConsent("manipulatePermanent", `Request to set position: ${target}`, {
        at: sel.at,
        index: sel.index,
        newState: target,
      });
      if (rid) {
        // When approved, simply apply locally (permanentPositions patch will sync)
        const unlisten = setInterval(() => {
          const entry = useGameStore.getState().interactionLog[rid];
          if (entry?.status === "approved") {
            clearInterval(unlisten as unknown as number);
            apply();
            const map = { ...pendingRequestRef.current };
            delete map[rid];
            pendingRequestRef.current = map;
          } else if (entry && (entry.status === "declined" || entry.status === "cancelled")) {
            clearInterval(unlisten as unknown as number);
          }
        }, 300);
        pendingRequestRef.current[rid] = { kind: "takeFromPile", seat, pile: "spellbook", count: 0, from: "top" };
      }
    } else {
      apply();
    }
  };

  const disabledOnlineOpponentDraw = isOnline && mySeat != null && drawSeat !== mySeat;

  const startToolboxRoll = () => {
    const value = Math.floor(Math.random() * 20) + 1;
    setD20Value(value);
    setD20Open(true);
    setD20Rolling(true);
    log(`Toolbox D20 roll: ${value}`);
    try {
      console.log(`[Toolbox] D20 roll: ${value}`);
    } catch {}
  };

  return (
    <div className="absolute bottom-3 right-3 z-20 text-white">
      <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg w-80">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="text-sm font-semibold">Toolbox</div>
          <button
            className="text-xs rounded bg-white/10 hover:bg-white/20 px-2 py-0.5"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
        {open && (
          <div className="p-3 space-y-3 text-sm">
            {/* Draw Controls */}
            <div>
              <div className="font-medium mb-1">Draw from pile</div>
              <div className="flex gap-2 mb-1">
                <select value={drawSeat} onChange={(e) => setDrawSeat(e.target.value as PlayerKey)} className="bg-white/10 rounded px-2 py-1">
                  <option value="p1">P1</option>
                  <option value="p2">P2</option>
                </select>
                <select value={drawPile} onChange={(e) => setDrawPile(e.target.value as "spellbook" | "atlas")} className="bg-white/10 rounded px-2 py-1">
                  <option value="spellbook">Spellbook</option>
                  <option value="atlas">Atlas</option>
                </select>
                <select value={drawFromWhere} onChange={(e) => setDrawFromWhere(e.target.value as "top" | "bottom")} className="bg-white/10 rounded px-2 py-1">
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                <input type="number" min={1} max={10} value={drawCount} onChange={(e) => setDrawCount(Number(e.target.value))} className="w-14 bg-white/10 rounded px-2 py-1" />
              </div>
              <button
                className={`w-full rounded bg-emerald-600/90 hover:bg-emerald-500 py-1 disabled:opacity-40`}
                onClick={handleDraw}
                disabled={disabledOnlineOpponentDraw}
                title={disabledOnlineOpponentDraw ? "Online: cannot draw from opponent piles" : ""}
              >
                Draw
              </button>
            </div>

            {/* Peek Pile */}
            <div>
              <div className="font-medium mb-1">Look at pile</div>
              <div className="flex gap-2 mb-1">
                <select value={peekSeat} onChange={(e) => setPeekSeat(e.target.value as PlayerKey)} className="bg-white/10 rounded px-2 py-1">
                  <option value="p1">P1</option>
                  <option value="p2">P2</option>
                </select>
                <select value={peekPile} onChange={(e) => setPeekPile(e.target.value as "spellbook" | "atlas")} className="bg-white/10 rounded px-2 py-1">
                  <option value="spellbook">Spellbook</option>
                  <option value="atlas">Atlas</option>
                </select>
                <select value={peekFromWhere} onChange={(e) => setPeekFromWhere(e.target.value as "top" | "bottom")} className="bg-white/10 rounded px-2 py-1">
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                <input type="number" min={1} max={20} value={peekCount} onChange={(e) => setPeekCount(Number(e.target.value))} className="w-14 bg-white/10 rounded px-2 py-1" />
              </div>
              <button
                className="w-full rounded bg-white/15 hover:bg-white/25 py-1"
                onClick={handlePeekPile}
              >
                Look
              </button>
            </div>

            {/* Inspect Hand */}
            <div>
              <div className="font-medium mb-1">Look at opponent hand</div>
              <button
                className="w-full rounded bg-white/15 hover:bg-white/25 py-1"
                onClick={handleInspectOpponentHand}
                title={isOnline ? "Requests opponent consent" : "Hotseat: opens the other hand"}
              >
                Inspect Hand
              </button>
            </div>

            {/* D20 Roll */}
            <div>
              <div className="font-medium mb-1">Roll D20</div>
              <button
                className="w-full rounded bg-blue-600/90 hover:bg-blue-500 py-1"
                onClick={startToolboxRoll}
              >
                Roll
              </button>
            </div>

            {/* Force Burrow/Submerge */}
            <div>
              <div className="font-medium mb-1">Burrow/Submerge (force)</div>
              <div className="grid grid-cols-3 gap-2">
                <button className="rounded bg-white/15 hover:bg-white/25 py-1 disabled:opacity-40" onClick={() => handleForcePosition("burrowed")} disabled={!selectedPermanent}>Burrow</button>
                <button className="rounded bg-white/15 hover:bg-white/25 py-1 disabled:opacity-40" onClick={() => handleForcePosition("submerged")} disabled={!selectedPermanent}>Submerge</button>
                <button className="rounded bg-white/15 hover:bg-white/25 py-1 disabled:opacity-40" onClick={() => handleForcePosition("surface")} disabled={!selectedPermanent}>Surface</button>
              </div>
              {!selectedPermanent && (
                <div className="text-xs opacity-70 mt-1">Tip: select a permanent on the board first</div>
              )}
            </div>
          </div>
        )}
      </div>

      {peekDialog && (
        <HandPeekDialog
          title={peekDialog.title}
          cards={peekDialog.cards}
          onClose={closePeekDialog}
        />
      )}
      {d20Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-zinc-900/90 rounded-2xl ring-1 ring-white/10 shadow-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Toolbox D20 Roll</h3>
              <button
                className="text-sm text-zinc-400 hover:text-white"
                onClick={() => {
                  setD20Open(false);
                  setD20Rolling(false);
                  setD20Value(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="bg-black/40 rounded-xl ring-1 ring-white/10" style={{ height: "260px" }}>
              <Canvas camera={{ position: [0, 0, 4], fov: 60 }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[5, 5, 5]} intensity={0.7} />
                <D20Dice
                  playerName="Toolbox"
                  player={mySeat ?? "p1"}
                  position={[0, 0, 0]}
                  roll={d20Value}
                  isRolling={d20Rolling}
                  onRollComplete={() => {
                    setD20Rolling(false);
                    // Leave the result visible briefly before auto-closing
                    setTimeout(() => {
                      setD20Open(false);
                      setD20Value(null);
                    }, 1200);
                  }}
                />
              </Canvas>
            </div>
            {d20Value !== null && !d20Rolling && (
              <div className="mt-4 text-center text-sm text-zinc-300">
                Result: <span className="font-semibold text-white">{d20Value}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
