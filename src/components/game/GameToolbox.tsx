"use client";

import { Canvas } from "@react-three/fiber";
import { Wrench } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import HandPeekDialog from "@/components/game/HandPeekDialog";
import D20Dice from "@/lib/game/components/D20Dice";
import { useGameStore, type PlayerKey, type CardRef, type ServerPatchT } from "@/lib/game/store";
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
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const transport = useGameStore((s) => s.transport);

  const isOnline = !!myPlayerId && !!matchId && !!opponentPlayerId && !!opponentSeat;

  // UI state
  const [open, setOpen] = useState(false);
  // Timer tick for live-updating countdowns (re-renders component)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [drawSeat, setDrawSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [drawPile, setDrawPile] = useState<"spellbook" | "atlas">("spellbook");
  const [drawCount, setDrawCount] = useState<number>(1);
  const [drawFromWhere, setDrawFromWhere] = useState<"top" | "bottom">("top");

  const [peekSeat, setPeekSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [peekPile, setPeekPile] = useState<"spellbook" | "atlas">("spellbook");
  const [peekCount, setPeekCount] = useState<number>(3);
  const [peekFromWhere, setPeekFromWhere] = useState<"top" | "bottom">("top");

  const [banishedSeat, setBanishedSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [unbanishSeat, setUnbanishSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [unbanishTarget, setUnbanishTarget] = useState<"hand" | "graveyard">("hand");

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
  const openSearchDialog = useGameStore((s) => s.openSearchDialog);
  const moveFromBanishedToZone = useGameStore((s) => s.moveFromBanishedToZone);
  const applyPatch = useGameStore((s) => s.applyPatch);
  const trySendPatch = useGameStore((s) => s.trySendPatch);
  const snapshots = useGameStore((s) => s.snapshots);
  const createSnapshot = useGameStore((s) => s.createSnapshot);
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);

  // Drive the indicator countdown via a simple interval
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => clearInterval(id as unknown as number);
  }, []);

  // Subscribe to shared d20Roll messages from the server.
  // When received, open the D20 overlay locally for both players.
  useEffect(() => {
    if (!transport?.on) return undefined;
    const off = transport.on("message", (m) => {
      const t = m && typeof m === "object" && (m as { type?: unknown }).type;
      if (t !== "d20Roll") return;
      const valRaw = (m as { value?: unknown }).value as number | undefined;
      const value = Number(valRaw);
      if (!Number.isFinite(value)) return;
      setD20Value(Math.max(1, Math.min(20, Math.floor(value))));
      setD20Open(true);
      setD20Rolling(true);
      try {
        console.log(`[Toolbox] D20 roll <= ${value}`);
      } catch {}
    });
    return () => {
      try { off?.(); } catch {}
    };
  }, [transport]);

  // Auto-snapshot backstop: once per (turn,currentPlayer) on Start phase
  const lastAutoSnapRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "Start") return;
    const key = `${turn}|${currentPlayer}|Start`;
    if (lastAutoSnapRef.current === key) return;
    const hasForTurn = Array.isArray(snapshots) && snapshots.some((s) => s.kind === "auto" && s.turn === turn);
    if (hasForTurn) {
      lastAutoSnapRef.current = key;
      return;
    }
    lastAutoSnapRef.current = key;
    try { createSnapshot(`Turn ${turn} start (P${currentPlayer})`, "auto"); } catch {}
  }, [phase, turn, currentPlayer, snapshots, createSnapshot]);

  // Derive snapshot lists
  const autoSnapshots = useMemo(
    () => (Array.isArray(snapshots) ? snapshots.filter((s) => s.kind === "auto") : []),
    [snapshots]
  );
  const archiveSnapshots = useMemo(
    () => (Array.isArray(snapshots) ? snapshots.filter((s) => (s.kind ?? "manual") === "manual") : []),
    [snapshots]
  );
  const [selectedAutoId, setSelectedAutoId] = useState<string | null>(null);
  useEffect(() => {
    if (!Array.isArray(autoSnapshots) || autoSnapshots.length === 0) {
      setSelectedAutoId(null);
      return;
    }
    const latest = autoSnapshots[autoSnapshots.length - 1];
    if (!selectedAutoId || !autoSnapshots.some((s) => s.id === selectedAutoId)) {
      setSelectedAutoId(latest.id);
    }
  }, [autoSnapshots]);

  // Archive if none; otherwise restore the latest archive (board + cemetery only)
  const handleArchiveOrRestoreRealm = () => {
    const item = archiveSnapshots.length > 0 ? archiveSnapshots[archiveSnapshots.length - 1] : null;
    if (!item) {
      createSnapshot("", "manual");
      return;
    }
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(item.payload || {}));
    const allowed = [
      "board",
      "avatars",
      "permanents",
      "permanentPositions",
      "permanentAbilities",
      "sitePositions",
      "playerPositions",
    ];
    const patch: Record<string, unknown> = {};
    const rawR = raw as Record<string, unknown>;
    for (const k of allowed) if (k in rawR) patch[k] = rawR[k];
    const zp = raw.zones as | { p1?: { graveyard?: unknown[] }; p2?: { graveyard?: unknown[] } } | undefined;
    const zonesPartial: Record<string, unknown> = {};
    if (zp && (zp.p1?.graveyard || zp.p2?.graveyard)) {
      zonesPartial.p1 = zp.p1 && zp.p1.graveyard ? { graveyard: zp.p1.graveyard } : {};
      zonesPartial.p2 = zp.p2 && zp.p2.graveyard ? { graveyard: zp.p2.graveyard } : {};
      (patch as Record<string, unknown>)["zones"] = zonesPartial as unknown;
    }
    const replaceKeys = Object.keys(patch).filter((k) => k !== "zones");
    (patch as { __replaceKeys?: string[] }).__replaceKeys = replaceKeys;
    if (isOnline && mySeat && opponentSeat) {
      requestConsent(
        "restoreSnapshot",
        `Restore the realm: ${item.title}`,
        { snapshot: patch }
      );
      return;
    }
    applyPatch(patch);
    trySendPatch(patch as ServerPatchT);
  };

  // Restore selected auto snapshot (full authoritative state)
  const handleRestoreSnapshot = () => {
    if (autoSnapshots.length === 0) return;
    const pool = autoSnapshots.slice(Math.max(autoSnapshots.length - 5, 0));
    const item = (selectedAutoId ? pool.find((s) => s.id === selectedAutoId) : null) || pool[pool.length - 1];
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(item.payload || {}));
    const keys = Object.keys(raw).filter((k) => k !== "__replaceKeys");
    (raw as { __replaceKeys?: string[] }).__replaceKeys = keys;
    if (isOnline && mySeat && opponentSeat) {
      requestConsent(
        "restoreSnapshot",
        `Restore snapshot: ${item.title}`,
        { snapshot: raw }
      );
      return;
    }
    applyPatch(raw);
    trySendPatch(raw as ServerPatchT);
  };

  const handleInspectBanished = () => {
    const seat = banishedSeat;
    if (isOnline && mySeat && seat !== mySeat) {
      const rid = requestConsent("inspectBanished", `Request to look at ${seat.toUpperCase()} banished`, { seat });
      if (rid) {
      }
      return;
    }
    const cards = zones[seat]?.banished || [];
    openSearchDialog(`${seat.toUpperCase()} Banished`, cards, () => {});
  };

  const handleUnbanish = () => {
    const seat = unbanishSeat;
    const target = unbanishTarget;
    const cards = zones[seat]?.banished || [];
    if (cards.length === 0) return;
    openSearchDialog(`${seat.toUpperCase()} Banished`, cards, (selected: CardRef) => {
      const instanceId = selected?.instanceId ?? null;
      if (!instanceId) return;
      if (isOnline && mySeat && seat !== mySeat) {
        const ttlMs = 20000;
        const rid = requestConsent(
          "unbanishCard",
          `Request to return from banished to ${target}`,
          { seat, instanceId, target, grant: { allowOpponentZoneWrite: true, targetSeat: seat, singleUse: true, expiresAt: Date.now() + ttlMs } as Record<string, unknown> }
        );
        if (rid) {
        }
        return;
      }
      moveFromBanishedToZone(seat, instanceId, target);
    });
  };

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
      | { kind: "instantSpell" }
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
  const isMyTurn = mySeat ? ((mySeat === "p1" ? 1 : 2) === currentPlayer) : false;
  const showInstantRequest = isOnline && !!mySeat && !isMyTurn;

  const handleRequestInstantSpell = () => {
    if (!showInstantRequest) return;
    const ttlMs = 20000; // 20s courtesy window
    const rid = requestConsent(
      "instantSpell",
      "Request to play a card out of turn",
      {
        // Show a helpful summary in the consent dialog
        proposedGrant: { singleUse: true, expiresAt: Date.now() + ttlMs },
      }
    );
    if (rid) {
      pendingRequestRef.current[rid] = { kind: "instantSpell" };
    }
  };
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
    if (isOnline && transport?.sendMessage) {
      try {
        transport.sendMessage({ type: "d20Roll", value });
      } catch {}
      // Log once; event log is synchronized via server patch in log()
      log(`Toolbox D20 roll: ${value}`);
      try {
        console.log(`[Toolbox] D20 roll: ${value}`);
      } catch {}
      // Do not open local-only popup here; the shared listener will open it for both players
      return;
    }
    // Offline/hotseat fallback: local popup
    setD20Value(value);
    setD20Open(true);
    setD20Rolling(true);
    log(`Toolbox D20 roll: ${value}`);
    try {
      console.log(`[Toolbox] D20 roll: ${value}`);
    } catch {}
  };

  const collapsed = !open;
  const containerWidthClass = collapsed ? "w-56 sm:w-64" : "w-72 sm:w-80";
  const headerPaddingClass = collapsed ? "px-2 py-1" : "px-2 py-1.5 sm:px-3 sm:py-2";
  const toggleBtnPaddingClass = collapsed ? "px-1.5 py-0.5" : "px-2 py-0.5";

  // Realm button presentation
  const isRealmArmed = archiveSnapshots.length > 0;
  const realmBtnText = isRealmArmed ? "Restore the Realm" : "Archive the Realm";
  const realmBtnClass = isRealmArmed
    ? "w-full rounded bg-amber-600/90 hover:bg-amber-500 py-1"
    : "w-full rounded bg-white/15 hover:bg-white/25 py-1";

  return (
    <div className="absolute bottom-3 right-3 z-20 text-white">
      {/* Instant permission indicator */}
      {(() => {
        // Compute active instant permission and its remaining time
        let msLeft: number | null = null;
        let hasExpiry = false;
        try {
          const now = nowMs;
          for (const entry of Object.values(interactionLog)) {
            if (!entry || entry.status !== "approved") continue;
            if (!entry.request || entry.request.kind !== "instantSpell") continue;
            const g = entry.grant as
              | { grantedTo?: string; expiresAt?: number; singleUse?: boolean }
              | null
              | undefined;
            if (!g) continue;
            const isMe = localPlayerId ? g.grantedTo === localPlayerId : entry.direction === "outbound";
            if (!isMe) continue;
            if (typeof g.expiresAt === "number") {
              const left = g.expiresAt - now;
              if (left > 0 && (msLeft === null || left > msLeft)) {
                msLeft = left;
                hasExpiry = true;
              }
            } else {
              // No expiry => active without countdown
              msLeft = 0;
              hasExpiry = false;
            }
          }
        } catch {}
        const show = msLeft !== null && (hasExpiry ? msLeft > 0 : true);
        if (!show) return null;
        const seconds = hasExpiry ? Math.ceil(Math.max(0, msLeft as number) / 1000) : null;
        return (
          <div className="flex justify-end mb-2 pr-1">
            <div className="rounded-full bg-purple-600/90 px-3 py-1 text-[11px] font-medium shadow ring-1 ring-white/10">
              Instant permission active{hasExpiry && seconds !== null ? ` · ${seconds}s` : ""}
            </div>
          </div>
        );
      })()}
      {!open ? (
        <button
          className="rounded bg-white/10 hover:bg-white/20 p-1.5 ring-1 ring-white/10 shadow-lg transition-colors"
          onClick={() => setOpen(true)}
          aria-label="Show toolbox"
          title="Toolbox"
        >
          <Wrench className="w-4 h-4" />
        </button>
      ) : (
        <div className={`bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg ${containerWidthClass} max-w-[92vw] transition-all`}>
          <div className={`flex items-center justify-between ${headerPaddingClass} border-b border-white/10`}>
            <div className="text-xs sm:text-sm font-semibold">Toolbox</div>
            <button
              className={`text-xs rounded bg-white/10 hover:bg-white/20 ${toggleBtnPaddingClass}`}
              onClick={() => setOpen(false)}
              aria-label="Hide toolbox"
              title="Hide"
            >
              Hide
            </button>
          </div>
          <div className="p-2 sm:p-3 space-y-3 text-xs sm:text-sm">
            {/* Instant Spell (request when not your turn) */}
            {showInstantRequest && (
              <div>
                <div className="font-medium mb-1">Instant: ask to play now</div>
                <button
                  className="w-full rounded bg-purple-600/90 hover:bg-purple-500 py-1"
                  onClick={handleRequestInstantSpell}
                  title="Sends a consent request to the acting player"
                >
                  Ask Permission
                </button>
              </div>
            )}
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
                <input type="number" min={1} max={10} value={drawCount} onChange={(e) => setDrawCount(Number(e.target.value))} className="w-12 sm:w-14 bg-white/10 rounded px-2 py-1" />
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
                <input type="number" min={1} max={20} value={peekCount} onChange={(e) => setPeekCount(Number(e.target.value))} className="w-12 sm:w-14 bg-white/10 rounded px-2 py-1" />
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

            {/* Inspect Banished */}
            <div>
              <div className="font-medium mb-1">Look at banished</div>
              <div className="flex gap-2 mb-1">
                <select value={banishedSeat} onChange={(e) => setBanishedSeat(e.target.value as PlayerKey)} className="bg-white/10 rounded px-2 py-1">
                  <option value="p1">P1</option>
                  <option value="p2">P2</option>
                </select>
                <button
                  className="flex-1 rounded bg-white/15 hover:bg-white/25 py-1"
                  onClick={handleInspectBanished}
                >
                  Inspect
                </button>
              </div>
            </div>

            {/* Return from Banished */}
            <div>
              <div className="font-medium mb-1">Return from banished</div>
              <div className="flex gap-2 mb-1">
                <select value={unbanishSeat} onChange={(e) => setUnbanishSeat(e.target.value as PlayerKey)} className="bg-white/10 rounded px-2 py-1">
                  <option value="p1">P1</option>
                  <option value="p2">P2</option>
                </select>
                <select value={unbanishTarget} onChange={(e) => setUnbanishTarget(e.target.value as "hand" | "graveyard")} className="bg-white/10 rounded px-2 py-1">
                  <option value="hand">Hand</option>
                  <option value="graveyard">Cemetery</option>
                </select>
              </div>
              <button
                className="w-full rounded bg-emerald-600/90 hover:bg-emerald-500 py-1"
                onClick={handleUnbanish}
              >
                Return a card
              </button>
            </div>

            {/* Snapshots (emergency full-state restore) */}
            <div>
              <div className="font-medium mb-1">Snapshots</div>
              {autoSnapshots.length > 0 && (
                <select
                  className="w-full mb-1 rounded bg-white/10 hover:bg-white/15 py-1 text-xs"
                  value={selectedAutoId ?? ""}
                  onChange={(e) => setSelectedAutoId(e.target.value || null)}
                >
                  {autoSnapshots
                    .slice(Math.max(autoSnapshots.length - 5, 0))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.ts).toLocaleTimeString()} · {s.title}
                      </option>
                    ))}
                </select>
              )}
              <button
                className="w-full rounded bg-emerald-600/90 hover:bg-emerald-500 py-1 disabled:opacity-40"
                onClick={handleRestoreSnapshot}
                disabled={autoSnapshots.length === 0}
                title="Emergency recovery: restores entire game state"
              >
                Restore snapshot
              </button>
              {autoSnapshots.length > 0 && selectedAutoId && (
                <div className="mt-1 text-xs opacity-70">
                  {(() => {
                    const pool = autoSnapshots.slice(Math.max(autoSnapshots.length - 5, 0));
                    const sel = pool.find((s) => s.id === selectedAutoId) || pool[pool.length - 1];
                    return `${new Date(sel.ts).toLocaleTimeString()} · ${sel.title}`;
                  })()}
                </div>
              )}
            </div>

            {/* Realm (single version: archive if none, otherwise restore board + cemetery) */}
            <div>
              <div className="font-medium mb-1">Realm</div>
              <button
                className={realmBtnClass}
                onClick={handleArchiveOrRestoreRealm}
                title={realmBtnText}
              >
                {realmBtnText}
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
        </div>
      )}

      {peekDialog ? (
        <HandPeekDialog
          title={peekDialog.title ?? ""}
          cards={peekDialog.cards}
          onClose={closePeekDialog}
        />
      ) : null}
      {d20Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-[92vw] sm:w-full max-w-md bg-zinc-900/90 rounded-2xl ring-1 ring-white/10 shadow-2xl p-4 sm:p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold">Toolbox D20 Roll</h3>
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
            <div className="bg-black/40 rounded-xl ring-1 ring-white/10 h-[42vh] min-h-[240px] sm:h-[260px]">
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
