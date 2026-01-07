"use client";

import { Canvas } from "@react-three/fiber";
import { Wrench, Eye, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useMemo } from "react";
import CardSearchDialog from "@/components/game/CardSearchDialog";
import HandPeekDialog from "@/components/game/HandPeekDialog";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";
import D20Dice from "@/lib/game/components/D20Dice";
import D6Dice from "@/lib/game/components/D6Dice";
import {
  useGameStore,
  type PlayerKey,
  type CardRef,
  type ServerPatchT,
} from "@/lib/game/store";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";
import {
  generateInteractionRequestId,
  type InteractionRequestKind,
} from "@/lib/net/interactions";

export type GameToolboxProps = {
  myPlayerId: string | null;
  mySeat: PlayerKey | null;
  opponentPlayerId?: string | null;
  opponentSeat?: PlayerKey | null;
  matchId?: string | null;
  playerNames?: { p1: string; p2: string };
};

export default function GameToolbox({
  myPlayerId,
  mySeat,
  opponentPlayerId = null,
  opponentSeat = null,
  matchId = null,
  playerNames = { p1: "Player 1", p2: "Player 2" },
}: GameToolboxProps) {
  const zones = useGameStore((s) => s.zones);
  const drawFrom = useGameStore((s) => s.drawFrom);
  const drawFromBottom = useGameStore((s) => s.drawFromBottom);
  const scryMany = useGameStore((s) => s.scryMany);
  const log = useGameStore((s) => s.log);
  const sendInteraction = useGameStore((s) => s.sendInteractionRequest);
  const interactionLog = useGameStore((s) => s.interactionLog);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const transport = useGameStore((s) => s.transport);

  const isOnline =
    !!myPlayerId && !!matchId && !!opponentPlayerId && !!opponentSeat;

  // Graphics settings for font scaling
  const { settings: graphicsSettings } = useGraphicsSettings();

  // Calculate font size based on uiTextScale (0.5-1.5 maps to 10px-16px)
  // Base size is 12px (text-xs), scaled with min 10px and max 16px
  const baseFontSize = 12;
  const scaledFontSize = Math.max(10, Math.min(16, Math.round(baseFontSize * graphicsSettings.uiTextScale)));
  const fontStyle = { fontSize: `${scaledFontSize}px` };

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
  const [peekCount, setPeekCount] = useState<number>(1);
  const [peekFromWhere, setPeekFromWhere] = useState<"top" | "bottom">("top");

  const [revealSeat, setRevealSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [revealPile, setRevealPile] = useState<"spellbook" | "atlas">(
    "spellbook"
  );
  const [revealCount, setRevealCount] = useState<number>(1);
  const [revealFromWhere, setRevealFromWhere] = useState<"top" | "bottom">(
    "top"
  );

  const [scrySeat, setScrySeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [scryPile, setScryPile] = useState<"spellbook" | "atlas">("spellbook");
  const [scryCount, setScryCount] = useState<number>(1);
  const [scryOpen, setScryOpen] = useState<boolean>(false);
  const [scryCards, setScryCards] = useState<CardRef[]>([]);
  const [scryBottom, setScryBottom] = useState<Record<number, boolean>>({});

  const [actionType, setActionType] = useState<
    "draw" | "peek" | "reveal" | "scry"
  >("draw");
  const [fixOpen, setFixOpen] = useState<boolean>(false);
  const [unbanishSeat, setUnbanishSeat] = useState<PlayerKey>(mySeat ?? "p1");
  const [unbanishTarget, setUnbanishTarget] = useState<"hand" | "graveyard">(
    "hand"
  );

  // Toolbox D20 overlay state
  const [d20Open, setD20Open] = useState(false);
  const [d20Rolling, setD20Rolling] = useState(false);
  const [d20Value, setD20Value] = useState<number | null>(null);

  // Toolbox D6 overlay state
  const [d6Open, setD6Open] = useState(false);
  const [d6Rolling, setD6Rolling] = useState(false);
  const [d6Value, setD6Value] = useState<number | null>(null);

  // Random spell state
  const [randomSpellLoading, setRandomSpellLoading] = useState(false);
  const addCardToHand = useGameStore((s) => s.addCardToHand);

  // Card search state
  const [cardSearchOpen, setCardSearchOpen] = useState(false);

  // Burrow/Submerge (forced)
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const permanents = useGameStore((s) => s.permanents);
  const setPermanentAbility = useGameStore((s) => s.setPermanentAbility);
  const setPermanentPosition = useGameStore((s) => s.setPermanentPosition);
  const updatePermanentState = useGameStore((s) => s.updatePermanentState);

  // Site drag toggle
  const allowSiteDrag = useGameStore((s) => s.allowSiteDrag);
  const toggleAllowSiteDrag = useGameStore((s) => s.toggleAllowSiteDrag);

  // Ownership overlay toggle
  const showOwnershipOverlay = useGameStore((s) => s.showOwnershipOverlay);
  const toggleOwnershipOverlay = useGameStore((s) => s.toggleOwnershipOverlay);

  // Card scale (for crowded tiles)
  const cardScale = useGameStore((s) => s.cardScale);
  const setCardScale = useGameStore((s) => s.setCardScale);

  // Peek dialog from central store (populated by interaction:result)
  const peekDialog = useGameStore((s) => s.peekDialog);
  const closePeekDialog = useGameStore((s) => s.closePeekDialog);
  const openSearchDialog = useGameStore((s) => s.openSearchDialog);
  const moveFromBanishedToZone = useGameStore((s) => s.moveFromBanishedToZone);
  const banishEntireGraveyard = useGameStore((s) => s.banishEntireGraveyard);
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

  // Subscribe to shared d20Roll and d6Roll messages from the server.
  // When received, open the dice overlay locally for both players.
  useEffect(() => {
    if (!transport?.on) return undefined;
    const off = transport.on("message", (m) => {
      const t = m && typeof m === "object" && (m as { type?: unknown }).type;
      if (t === "d20Roll") {
        const valRaw = (m as { value?: unknown }).value as number | undefined;
        const value = Number(valRaw);
        if (!Number.isFinite(value)) return;
        console.log(`[Toolbox] D20 roll received: ${value}`);
        // Set all state in one batch - React will batch these
        setD20Value(Math.max(1, Math.min(20, Math.floor(value))));
        setD20Open(true);
        setD20Rolling(true);
      } else if (t === "d6Roll") {
        const valRaw = (m as { value?: unknown }).value as number | undefined;
        const value = Number(valRaw);
        if (!Number.isFinite(value)) return;
        console.log(`[Toolbox] D6 roll received: ${value}`);
        // Set all state in one batch - React will batch these
        setD6Value(Math.max(1, Math.min(6, Math.floor(value))));
        setD6Open(true);
        setD6Rolling(true);
      }
    });
    return () => {
      try {
        off?.();
      } catch {}
    };
  }, [transport]);

  const disabledOnlineOpponentScry =
    isOnline && mySeat != null && scrySeat !== mySeat;
  const handleOpenScry = () => {
    if (disabledOnlineOpponentScry) {
      log("Online: cannot scry opponent piles");
      return;
    }
    const cards =
      scryPile === "spellbook"
        ? zones[scrySeat]?.spellbook || []
        : zones[scrySeat]?.atlas || [];
    const cnt = Math.max(1, Math.min(Math.floor(scryCount) || 1, cards.length));
    if (cnt <= 0) return;
    setScryCards(cards.slice(0, cnt));
    setScryBottom({});
    setScryOpen(true);
  };
  const toggleScryIndex = (i: number) => {
    setScryBottom((prev) => {
      const next = { ...prev } as Record<number, boolean>;
      next[i] = !next[i];
      return next;
    });
  };
  const applyScry = () => {
    const bottomIndexes = scryCards
      .map((_, i) => (scryBottom[i] ? i : -1))
      .filter((i) => i >= 0);
    if (scryCards.length > 0) {
      scryMany(scrySeat, scryPile, scryCards.length, bottomIndexes);
    }
    setScryOpen(false);
  };

  // Auto-snapshot backstop: once per (turn,currentPlayer) on Start phase
  // Only create snapshot on the client whose turn is starting to avoid duplicates in online play
  const lastAutoSnapRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "Start") return;
    // Determine if this is the current player's client
    const currentPlayerSeat = currentPlayer === 1 ? "p1" : "p2";
    const isMyTurn = mySeat === currentPlayerSeat;
    // In online play, only the player whose turn is starting creates the snapshot
    // In offline play (mySeat is null or undefined), always create
    if (mySeat && !isMyTurn) return;

    const key = `${turn}|${currentPlayer}|Start`;
    if (lastAutoSnapRef.current === key) return;
    const hasForTurn =
      Array.isArray(snapshots) &&
      snapshots.some((s) => s.kind === "auto" && s.turn === turn);
    if (hasForTurn) {
      lastAutoSnapRef.current = key;
      return;
    }
    lastAutoSnapRef.current = key;
    try {
      createSnapshot(`Turn ${turn} start (P${currentPlayer})`, "auto");
    } catch {}
  }, [phase, turn, currentPlayer, snapshots, createSnapshot, mySeat]);

  // Derive snapshot lists
  const autoSnapshots = useMemo(
    () =>
      Array.isArray(snapshots)
        ? snapshots.filter((s) => s.kind === "auto")
        : [],
    [snapshots]
  );
  const archiveSnapshots = useMemo(
    () =>
      Array.isArray(snapshots)
        ? snapshots.filter((s) => (s.kind ?? "manual") === "manual")
        : [],
    [snapshots]
  );
  const [selectedAutoId, setSelectedAutoId] = useState<string | null>(null);
  useEffect(() => {
    if (!Array.isArray(autoSnapshots) || autoSnapshots.length === 0) {
      setSelectedAutoId(null);
      return;
    }
    const latest = autoSnapshots[autoSnapshots.length - 1];
    if (
      !selectedAutoId ||
      !autoSnapshots.some((s) => s.id === selectedAutoId)
    ) {
      setSelectedAutoId(latest.id);
    }
  }, [autoSnapshots, selectedAutoId]);

  // Archive if none; otherwise restore the latest archive (board + cemetery only)
  const handleArchiveOrRestoreRealm = () => {
    const item =
      archiveSnapshots.length > 0
        ? archiveSnapshots[archiveSnapshots.length - 1]
        : null;
    if (!item) {
      createSnapshot("", "manual");
      return;
    }
    const raw: Record<string, unknown> = JSON.parse(
      JSON.stringify(item.payload || {})
    );
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
    const zp = raw.zones as
      | { p1?: { graveyard?: unknown[] }; p2?: { graveyard?: unknown[] } }
      | undefined;
    const zonesPartial: Record<string, unknown> = {};
    if (zp && (zp.p1?.graveyard || zp.p2?.graveyard)) {
      zonesPartial.p1 =
        zp.p1 && zp.p1.graveyard ? { graveyard: zp.p1.graveyard } : {};
      zonesPartial.p2 =
        zp.p2 && zp.p2.graveyard ? { graveyard: zp.p2.graveyard } : {};
      (patch as Record<string, unknown>)["zones"] = zonesPartial as unknown;
    }
    const replaceKeys = Object.keys(patch).filter((k) => k !== "zones");
    (patch as { __replaceKeys?: string[] }).__replaceKeys = replaceKeys;
    // Include snapshot timestamp so server can truncate replay actions after this point
    (patch as { __snapshotTs?: number }).__snapshotTs = item.ts;
    if (isOnline && mySeat && opponentSeat) {
      requestConsent("restoreSnapshot", `Restore the realm: ${item.title}`, {
        snapshot: patch,
      });
      return;
    }
    applyPatch(patch);
    trySendPatch(patch as ServerPatchT);
  };

  // Restore selected auto snapshot (full authoritative state)
  const handleRestoreSnapshot = () => {
    if (autoSnapshots.length === 0) return;
    const pool = autoSnapshots.slice(Math.max(autoSnapshots.length - 5, 0));
    const item =
      (selectedAutoId ? pool.find((s) => s.id === selectedAutoId) : null) ||
      pool[pool.length - 1];
    const raw: Record<string, unknown> = JSON.parse(
      JSON.stringify(item.payload || {})
    );
    const keys = Object.keys(raw).filter((k) => k !== "__replaceKeys");
    (raw as { __replaceKeys?: string[] }).__replaceKeys = keys;
    // Include snapshot timestamp so server can truncate replay actions after this point
    (raw as { __snapshotTs?: number }).__snapshotTs = item.ts;
    if (isOnline && mySeat && opponentSeat) {
      requestConsent("restoreSnapshot", `Restore snapshot: ${item.title}`, {
        snapshot: raw,
      });
      return;
    }
    applyPatch(raw);
    trySendPatch(raw as ServerPatchT);
  };

  const handleUnbanish = () => {
    const seat = unbanishSeat;
    const target = unbanishTarget;
    const cards = zones[seat]?.banished || [];
    if (cards.length === 0) return;
    openSearchDialog(
      `${seat.toUpperCase()} Banished`,
      cards,
      (selected: CardRef) => {
        const instanceId = selected?.instanceId ?? null;
        if (!instanceId) return;
        if (isOnline && mySeat && seat !== mySeat) {
          const ttlMs = 20000;
          const rid = requestConsent(
            "unbanishCard",
            `Request to return from banished to ${target}`,
            {
              seat,
              instanceId,
              target,
              grant: {
                allowOpponentZoneWrite: true,
                targetSeat: seat,
                singleUse: true,
                expiresAt: Date.now() + ttlMs,
              } as Record<string, unknown>,
            }
          );
          if (rid) {
          }
          return;
        }
        moveFromBanishedToZone(seat, instanceId, target);
      }
    );
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
  function requireOnlineIds(): {
    from: string;
    to: string;
    mid: string;
  } | null {
    if (!isOnline || !myPlayerId || !matchId || !opponentPlayerId) return null;
    return { from: myPlayerId, to: opponentPlayerId, mid: matchId };
  }

  function requestConsent(
    kind: InteractionRequestKind,
    note: string,
    payload: Record<string, unknown>
  ) {
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
  const isMyTurn = mySeat ? (mySeat === "p1" ? 1 : 2) === currentPlayer : false;
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
        pendingRequestRef.current[rid] = {
          kind: "takeFromPile",
          seat,
          pile,
          count: cnt,
          from,
        };
      }
      return;
    }
    // Offline/hotseat fallback: open immediately
    const cards =
      pile === "spellbook"
        ? zones[seat]?.spellbook || []
        : zones[seat]?.atlas || [];
    const slice =
      from === "top"
        ? cards.slice(0, cnt)
        : cards.slice(Math.max(0, cards.length - cnt));
    useGameStore
      .getState()
      .openPeekDialog(
        `${seat.toUpperCase()} ${
          pile === "spellbook" ? "Spellbook" : "Atlas"
        } (${from})`,
        slice,
        { seat, pile, from }
      );
  };

  const handleReveal = () => {
    const seat = revealSeat;
    const pile = revealPile;
    const cnt = Math.max(1, Math.floor(revealCount));
    const from = revealFromWhere;
    const cards =
      pile === "spellbook"
        ? zones[seat]?.spellbook || []
        : zones[seat]?.atlas || [];
    const slice =
      from === "top"
        ? cards.slice(0, cnt)
        : cards.slice(Math.max(0, cards.length - cnt));
    const title = `${seat.toUpperCase()} ${
      pile === "spellbook" ? "Spellbook" : "Atlas"
    } (${from}) - REVEALED`;

    // Open locally
    useGameStore.getState().openPeekDialog(title, slice, { seat, pile, from });

    // Broadcast to opponent so they see it too
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "revealCards",
          title,
          cards: slice,
          source: { seat, pile, from },
        });
      } catch {}
    }
  };

  const handleInspectOpponentHand = () => {
    if (!opponentSeat) {
      // Offline: show the other seat from mySeat else default to p2
      const seat: PlayerKey = mySeat === "p1" ? "p2" : "p1";
      const cards = zones[seat]?.hand || [];
      useGameStore
        .getState()
        .openPeekDialog(`${seat.toUpperCase()} Hand`, [...cards], {
          seat,
          pile: "hand",
          from: "top",
        });
      return;
    }
    if (isOnline) {
      const rid = requestConsent("inspectHand", "Request to inspect hand", {
        seat: opponentSeat,
      });
      if (rid) {
        pendingRequestRef.current[rid] = {
          kind: "inspectHand",
          seat: opponentSeat,
        };
      }
    } else {
      const cards = zones[opponentSeat]?.hand || [];
      useGameStore
        .getState()
        .openPeekDialog(`${opponentSeat.toUpperCase()} Hand`, [...cards], {
          seat: opponentSeat,
          pile: "hand",
          from: "top",
        });
    }
  };

  const handleForcePosition = (
    target: "burrowed" | "submerged" | "surface"
  ) => {
    const sel = selectedPermanent;
    if (!sel) {
      log("Select a permanent on the board first");
      return;
    }
    const owner = permanents[sel.at]?.[sel.index]?.owner ?? 1;
    const seat: PlayerKey = seatFromOwner((owner ?? 1) as 1 | 2);

    const apply = () => {
      // Use instanceId for stable identification (prevents state leakage on card movement)
      const item = permanents[sel.at]?.[sel.index];
      const permanentId = item?.instanceId ?? `perm:${sel.at}:${sel.index}`;
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
      const rid = requestConsent(
        "manipulatePermanent",
        `Request to set position: ${target}`,
        {
          at: sel.at,
          index: sel.index,
          newState: target,
        }
      );
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
          } else if (
            entry &&
            (entry.status === "declined" || entry.status === "cancelled")
          ) {
            clearInterval(unlisten as unknown as number);
          }
        }, 300);
        pendingRequestRef.current[rid] = {
          kind: "takeFromPile",
          seat,
          pile: "spellbook",
          count: 0,
          from: "top",
        };
      }
    } else {
      apply();
    }
  };

  const disabledOnlineOpponentDraw =
    isOnline && mySeat != null && drawSeat !== mySeat;

  // Retry state for toolbox D20 roll
  const [d20Pending, setD20Pending] = useState<{
    value: number;
    ts: number;
  } | null>(null);
  const d20RetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Retry state for toolbox D6 roll
  const [d6Pending, setD6Pending] = useState<{
    value: number;
    ts: number;
  } | null>(null);
  const d6RetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear retry intervals on unmount
  useEffect(() => {
    return () => {
      if (d20RetryRef.current) clearInterval(d20RetryRef.current);
      if (d6RetryRef.current) clearInterval(d6RetryRef.current);
    };
  }, []);

  // Clear pending when we receive the d20Roll message back (means server got it)
  useEffect(() => {
    if (d20Open && d20Pending) {
      // D20 overlay opened means message was received
      setD20Pending(null);
      if (d20RetryRef.current) {
        clearInterval(d20RetryRef.current);
        d20RetryRef.current = null;
      }
    }
  }, [d20Open, d20Pending]);

  // Clear pending when we receive the d6Roll message back (means server got it)
  useEffect(() => {
    if (d6Open && d6Pending) {
      // D6 overlay opened means message was received
      setD6Pending(null);
      if (d6RetryRef.current) {
        clearInterval(d6RetryRef.current);
        d6RetryRef.current = null;
      }
    }
  }, [d6Open, d6Pending]);

  const startToolboxRoll = () => {
    const value = Math.floor(Math.random() * 20) + 1;
    if (isOnline && transport?.sendMessage) {
      // Capture sendMessage to avoid closure issues with possibly undefined transport
      const sendMsg = transport.sendMessage.bind(transport);
      const sendD20Message = () => {
        try {
          sendMsg({ type: "d20Roll", value });
          console.log(`[Toolbox] D20 roll sent: ${value}`);
        } catch (err) {
          console.warn(`[Toolbox] D20 send failed:`, err);
        }
      };

      // Send immediately
      sendD20Message();
      log(`Toolbox D20 roll: ${value}`);

      // Set up retry mechanism with captured start time
      const startTs = Date.now();
      setD20Pending({ value, ts: startTs });
      if (d20RetryRef.current) clearInterval(d20RetryRef.current);

      let retryCount = 0;
      const maxRetries = 5;
      d20RetryRef.current = setInterval(() => {
        retryCount++;
        // Check if d20 overlay opened (means message was received)
        if (d20Open) {
          setD20Pending(null);
          if (d20RetryRef.current) clearInterval(d20RetryRef.current);
          d20RetryRef.current = null;
          return;
        }
        // Retry up to maxRetries times
        if (retryCount >= maxRetries) {
          console.warn(
            `[Toolbox] D20 roll failed after ${maxRetries} retries, showing locally`
          );
          // Fallback: show locally if server never responded
          setD20Value(value);
          setD20Open(true);
          setD20Rolling(true);
          setD20Pending(null);
          if (d20RetryRef.current) clearInterval(d20RetryRef.current);
          d20RetryRef.current = null;
          return;
        }
        console.log(
          `[Toolbox] Retrying D20 roll send (${retryCount}/${maxRetries})...`
        );
        sendD20Message();
      }, 3000);

      return;
    }
    // Offline/hotseat fallback: local popup
    log(`Toolbox D20 roll: ${value}`);
    console.log(`[Toolbox] D20 roll (offline): ${value}`);
    setD20Value(value);
    setD20Open(true);
    setD20Rolling(true);
  };

  const startD6Roll = () => {
    const value = Math.floor(Math.random() * 6) + 1;
    if (isOnline && transport?.sendMessage) {
      const sendMsg = transport.sendMessage.bind(transport);
      const sendD6Message = () => {
        try {
          sendMsg({ type: "d6Roll", value });
          console.log(`[Toolbox] D6 roll sent: ${value}`);
        } catch (err) {
          console.warn(`[Toolbox] D6 send failed:`, err);
        }
      };

      sendD6Message();
      log(`Toolbox D6 roll: ${value}`);

      const startTs = Date.now();
      setD6Pending({ value, ts: startTs });
      if (d6RetryRef.current) clearInterval(d6RetryRef.current);

      let retryCount = 0;
      const maxRetries = 5;
      d6RetryRef.current = setInterval(() => {
        retryCount++;
        if (d6Open) {
          setD6Pending(null);
          if (d6RetryRef.current) clearInterval(d6RetryRef.current);
          d6RetryRef.current = null;
          return;
        }
        if (retryCount >= maxRetries) {
          console.warn(
            `[Toolbox] D6 roll failed after ${maxRetries} retries, showing locally`
          );
          // Fallback: show locally if server never responded
          setD6Value(value);
          setD6Open(true);
          setD6Rolling(true);
          setD6Pending(null);
          if (d6RetryRef.current) clearInterval(d6RetryRef.current);
          d6RetryRef.current = null;
          return;
        }
        console.log(
          `[Toolbox] Retrying D6 roll send (${retryCount}/${maxRetries})...`
        );
        sendD6Message();
      }, 3000);

      return;
    }
    // Offline/hotseat fallback: local popup
    log(`Toolbox D6 roll: ${value}`);
    console.log(`[Toolbox] D6 roll (offline): ${value}`);
    setD6Value(value);
    setD6Open(true);
    setD6Rolling(true);
  };

  const handleDrawRandomSpell = async () => {
    if (!mySeat) {
      log("No seat assigned");
      return;
    }
    setRandomSpellLoading(true);
    try {
      const res = await fetch("/api/cards/random-spell");
      if (!res.ok) {
        const data = await res.json();
        log(`Failed to fetch random spell: ${data.error || "Unknown error"}`);
        return;
      }
      const spell = await res.json();
      addCardToHand(mySeat, {
        cardId: spell.cardId,
        variantId: spell.variantId,
        name: spell.name,
        type: spell.type,
        slug: spell.slug,
        thresholds: spell.thresholds,
      });
    } catch (e) {
      log(
        `Error fetching random spell: ${
          e instanceof Error ? e.message : "Unknown"
        }`
      );
    } finally {
      setRandomSpellLoading(false);
    }
  };

  const handleSearchAndDraw = (card: {
    cardId: number;
    variantId: number;
    name: string;
    slug: string;
    type: string | null;
    subTypes: string | null;
    cost: number | null;
    attack: number | null;
    defence: number | null;
  }) => {
    if (!mySeat) {
      log("No seat assigned");
      return;
    }
    addCardToHand(mySeat, {
      cardId: card.cardId,
      variantId: card.variantId,
      name: card.name,
      type: card.type,
      slug: card.slug,
      subTypes: card.subTypes,
      cost: card.cost,
      thresholds: null, // Toolbox cards don't enforce thresholds
    });
    setCardSearchOpen(false);
  };

  const collapsed = !open;
  const containerWidthClass = collapsed ? "w-56 sm:w-64" : "w-72 sm:w-80";
  const headerPaddingClass = collapsed
    ? "px-2 py-1"
    : "px-2 py-1.5 sm:px-3 sm:py-2";
  const toggleBtnPaddingClass = collapsed ? "px-1.5 py-0.5" : "px-2 py-0.5";

  // Realm button presentation
  const isRealmArmed = archiveSnapshots.length > 0;
  const realmBtnText = isRealmArmed
    ? "Restore the Realm"
    : "Archive the Realm (Kairos)";
  const realmBtnClass = isRealmArmed
    ? "w-full rounded bg-amber-600/90 hover:bg-amber-500 py-1"
    : "w-full rounded bg-purple-600/90 hover:bg-purple-500 py-1";

  return (
    <div className="text-white">
      {/* Instant permission indicator */}
      {(() => {
        // Compute active instant permission and its remaining time
        let msLeft: number | null = null;
        let hasExpiry = false;
        try {
          const now = nowMs;
          for (const entry of Object.values(interactionLog)) {
            if (!entry || entry.status !== "approved") continue;
            if (!entry.request || entry.request.kind !== "instantSpell")
              continue;
            const g = entry.grant as
              | { grantedTo?: string; expiresAt?: number; singleUse?: boolean }
              | null
              | undefined;
            if (!g) continue;
            const isMe = localPlayerId
              ? g.grantedTo === localPlayerId
              : entry.direction === "outbound";
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
        const seconds = hasExpiry
          ? Math.ceil(Math.max(0, msLeft as number) / 1000)
          : null;
        return (
          <div className="flex justify-end mb-2 pr-1">
            <div className="rounded-full bg-purple-600/90 px-3 py-1 text-[11px] font-medium shadow ring-1 ring-white/10">
              Instant permission active
              {hasExpiry && seconds !== null ? ` · ${seconds}s` : ""}
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
        <div
          className={`bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg ${containerWidthClass} max-w-[92vw] transition-all`}
        >
          <div
            className={`flex items-center justify-between ${headerPaddingClass} border-b border-white/10`}
          >
            <div className="font-semibold" style={fontStyle}>Toolbox</div>
            <button
              className={`rounded bg-white/10 hover:bg-white/20 ${toggleBtnPaddingClass}`}
              style={fontStyle}
              onClick={() => setOpen(false)}
              aria-label="Hide toolbox"
              title="Hide"
            >
              Hide
            </button>
          </div>
          <div className="p-2 sm:p-3 space-y-3" style={fontStyle}>
            {/* Instant Spell (request when not your turn) */}
            {showInstantRequest && (
              <div>
                <button
                  className="w-full rounded bg-purple-600/90 hover:bg-purple-500 py-1"
                  onClick={handleRequestInstantSpell}
                  title="Sends a consent request to the acting player"
                >
                  Ask Permission
                </button>
              </div>
            )}
            {/* Combined pile action: Draw / Peek / Scry */}
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
              <div className="flex flex-wrap gap-2 mb-1">
                <select
                  value={actionType}
                  onChange={(e) =>
                    setActionType(e.target.value as typeof actionType)
                  }
                  className="bg-white/10 rounded px-2 py-1"
                >
                  <option value="draw">Draw</option>
                  <option value="peek">Peek</option>
                  <option value="reveal">Reveal</option>
                  <option value="scry">Scry</option>
                </select>
                <select
                  value={drawSeat}
                  onChange={(e) => {
                    const v = e.target.value as PlayerKey;
                    setDrawSeat(v);
                    setPeekSeat(v);
                    setRevealSeat(v);
                    setScrySeat(v);
                  }}
                  className="bg-white/10 rounded px-2 py-1"
                >
                  <option value="p1">{playerNames.p1}</option>
                  <option value="p2">{playerNames.p2}</option>
                </select>
                <select
                  value={drawPile}
                  onChange={(e) => {
                    const v = e.target.value as "spellbook" | "atlas";
                    setDrawPile(v);
                    setPeekPile(v);
                    setRevealPile(v);
                    setScryPile(v);
                  }}
                  className="bg-white/10 rounded px-2 py-1"
                >
                  <option value="spellbook">Spellbook</option>
                  <option value="atlas">Atlas</option>
                </select>
                <select
                  value={drawFromWhere}
                  onChange={(e) => {
                    const v = e.target.value as "top" | "bottom";
                    setDrawFromWhere(v);
                    setPeekFromWhere(v);
                    setRevealFromWhere(v);
                  }}
                  className={`bg-white/10 rounded px-2 py-1 ${
                    actionType === "scry"
                      ? "opacity-50 pointer-events-none"
                      : ""
                  }`}
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={drawCount}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setDrawCount(n);
                    setPeekCount(n);
                    setRevealCount(n);
                    setScryCount(n);
                  }}
                  className="w-12 sm:w-14 bg-white/10 rounded px-2 py-1"
                />
              </div>
              <button
                className={`w-full rounded ${
                  actionType === "draw"
                    ? "bg-emerald-600/90 hover:bg-emerald-500"
                    : "bg-white/15 hover:bg-white/25"
                } py-1 disabled:opacity-40`}
                onClick={() => {
                  if (actionType === "draw") return handleDraw();
                  if (actionType === "peek") return handlePeekPile();
                  if (actionType === "reveal") return handleReveal();
                  return handleOpenScry();
                }}
                disabled={
                  (actionType === "draw" && disabledOnlineOpponentDraw) ||
                  (actionType === "scry" && disabledOnlineOpponentScry)
                }
                title={
                  actionType === "draw" && disabledOnlineOpponentDraw
                    ? "Online: cannot draw from opponent piles"
                    : actionType === "scry" && disabledOnlineOpponentScry
                    ? "Online: cannot scry opponent piles"
                    : ""
                }
              >
                {actionType === "draw"
                  ? `Draw • ${drawSeat.toUpperCase()} • ${drawPile} • ${drawFromWhere} • x${drawCount}`
                  : actionType === "peek"
                  ? `Peek • ${peekSeat.toUpperCase()} • ${peekPile} • ${peekFromWhere} • x${peekCount}`
                  : actionType === "reveal"
                  ? `Reveal • ${revealSeat.toUpperCase()} • ${revealPile} • ${revealFromWhere} • x${revealCount}`
                  : `Scry • ${scrySeat.toUpperCase()} • ${scryPile} • x${scryCount}`}
              </button>

              {scryOpen && (
                <div className="mt-2 rounded-xl bg-black/30 ring-1 ring-white/10 p-2">
                  <div className="text-xs opacity-80 mb-2">
                    Click to mark cards to put on bottom
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {scryCards.map((c, i) => {
                      const isSite = (c.type || "")
                        .toLowerCase()
                        .includes("site");
                      const onBottom = !!scryBottom[i];
                      return (
                        <button
                          key={i}
                          className={`relative flex-shrink-0 ${
                            onBottom
                              ? "ring-2 ring-red-400"
                              : "ring-1 ring-white/20"
                          } rounded overflow-hidden`}
                          onClick={() => toggleScryIndex(i)}
                        >
                          <div
                            className={`${
                              isSite
                                ? "relative aspect-[4/3] w-20 sm:w-24"
                                : "relative aspect-[3/4] w-16 sm:w-20"
                            }`}
                          >
                            <Image
                              src={`/api/images/${c.slug}`}
                              alt={c.name}
                              fill
                              sizes="(max-width: 640px) 80px, 96px"
                              className={`object-contain ${
                                isSite ? "rotate-90" : ""
                              }`}
                              unoptimized
                            />
                          </div>
                          {onBottom && (
                            <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center text-[10px] font-bold">
                              BOTTOM
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded bg-emerald-600/90 hover:bg-emerald-500 py-1"
                      onClick={applyScry}
                    >
                      Apply
                    </button>
                    <button
                      className="flex-1 rounded bg-white/10 hover:bg-white/20 py-1"
                      onClick={() => setScryOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Inspect Hand + D20 + D6 row */}
            <div className="flex gap-1.5">
              <button
                className="flex-1 rounded bg-blue-600/90 hover:bg-blue-500 px-2 py-1.5 inline-flex items-center justify-center gap-1.5"
                onClick={handleInspectOpponentHand}
                title={
                  isOnline
                    ? "Requests opponent consent"
                    : "Hotseat: opens the other hand"
                }
              >
                <Eye className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs whitespace-nowrap">Inspect Hand</span>
              </button>
              <button
                className="rounded bg-blue-600/90 hover:bg-blue-500 px-3 py-1.5 flex items-center justify-center"
                onClick={startToolboxRoll}
                aria-label="Roll D20"
                title="Roll D20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/d20.svg" alt="D20" width={18} height={18} />
              </button>
              <button
                className="rounded bg-blue-600/90 hover:bg-blue-500 px-3 py-1.5 flex items-center justify-center"
                onClick={startD6Roll}
                aria-label="Roll D6"
                title="Roll D6"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/d6.svg"
                  alt="D6"
                  width={18}
                  height={18}
                  className="invert"
                />
              </button>
            </div>

            {/* Force Burrow/Submerge (moved under Inspect/D20) */}
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
              <div className="grid grid-cols-3 gap-2">
                <button
                  className="rounded bg-white/15 hover:bg-white/25 py-1 disabled:opacity-40"
                  onClick={() => handleForcePosition("burrowed")}
                  disabled={!selectedPermanent}
                >
                  Burrow
                </button>
                <button
                  className="rounded bg-white/15 hover:bg-white/25 py-1 disabled:opacity-40"
                  onClick={() => handleForcePosition("submerged")}
                  disabled={!selectedPermanent}
                >
                  Submerge
                </button>
                <button
                  className="rounded bg-white/15 hover:bg-white/25 py-1 disabled:opacity-40"
                  onClick={() => handleForcePosition("surface")}
                  disabled={!selectedPermanent}
                >
                  Surface
                </button>
              </div>
              {!selectedPermanent && (
                <div className="text-xs opacity-70 mt-1">
                  Tip: select a permanent on the board first
                </div>
              )}
            </div>

            {/* Board Toggles */}
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSiteDrag}
                  onChange={toggleAllowSiteDrag}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 focus:ring-amber-500/50"
                />
                <span className="text-xs">Allow dragging sites on board</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOwnershipOverlay}
                  onChange={toggleOwnershipOverlay}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-sky-500 focus:ring-sky-500/50"
                />
                <span className="text-xs">Show ownership highlight</span>
              </label>
              {/* Card Scale slider */}
              <div className="flex items-center gap-2">
                <span className="text-xs whitespace-nowrap">Card Size</span>
                <input
                  type="range"
                  min={0.25}
                  max={1}
                  step={0.05}
                  value={cardScale}
                  onChange={(e) => setCardScale(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-xs w-8 text-right">
                  {Math.round(cardScale * 100)}%
                </span>
              </div>
            </div>

            {/* Fix Game State subview */}
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
              <button
                className="w-full rounded bg-white/15 hover:bg-white/25 py-1"
                onClick={() => setFixOpen((v) => !v)}
                aria-expanded={fixOpen}
              >
                {fixOpen ? "Fix Game State ▲" : "Fix Game State ▼"}
              </button>
              {fixOpen && (
                <div className="mt-2 space-y-2">
                  {/* Return from Banished */}
                  <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
                    <div className="flex gap-2 mb-1">
                      <select
                        value={unbanishSeat}
                        onChange={(e) =>
                          setUnbanishSeat(e.target.value as PlayerKey)
                        }
                        className="bg-white/10 rounded px-2 py-1"
                      >
                        <option value="p1">P1</option>
                        <option value="p2">P2</option>
                      </select>
                      <select
                        value={unbanishTarget}
                        onChange={(e) =>
                          setUnbanishTarget(
                            e.target.value as "hand" | "graveyard"
                          )
                        }
                        className="bg-white/10 rounded px-2 py-1"
                      >
                        <option value="hand">Hand</option>
                        <option value="graveyard">Cemetery</option>
                      </select>
                    </div>
                    <button
                      className="w-full rounded bg-emerald-600/90 hover:bg-emerald-500 py-1"
                      onClick={handleUnbanish}
                    >
                      Return banished card
                    </button>
                  </div>

                  {/* Draw Random Spell */}
                  <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2 space-y-2">
                    <button
                      className="w-full rounded bg-purple-600/90 hover:bg-purple-500 py-1 disabled:opacity-40"
                      onClick={handleDrawRandomSpell}
                      disabled={randomSpellLoading || !mySeat}
                      title="Draw a random spell from the entire card pool to hand"
                    >
                      {randomSpellLoading ? "Drawing..." : "Draw Random Spell"}
                    </button>
                    <button
                      className="w-full rounded bg-cyan-600/90 hover:bg-cyan-500 py-1 disabled:opacity-40 flex items-center justify-center gap-1.5"
                      onClick={() => setCardSearchOpen(true)}
                      disabled={!mySeat}
                      title="Search and draw any card from the database"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search &amp; Draw Card
                    </button>
                  </div>

                  {/* Banish Entire Cemetery */}
                  <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
                    <button
                      className="w-full rounded bg-red-600/90 hover:bg-red-500 py-1 disabled:opacity-40"
                      onClick={() => {
                        if (mySeat) banishEntireGraveyard(mySeat);
                      }}
                      disabled={
                        !mySeat || (zones[mySeat]?.graveyard?.length ?? 0) === 0
                      }
                      title="Banish all cards in your cemetery"
                    >
                      Banish Entire Cemetery (
                      {zones[mySeat ?? "p1"]?.graveyard?.length ?? 0})
                    </button>
                  </div>

                  {/* Snapshots */}
                  <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
                    {autoSnapshots.length > 0 && (
                      <select
                        className="w-full mb-1 rounded bg-white/10 hover:bg-white/15 py-1 text-xs"
                        value={selectedAutoId ?? ""}
                        onChange={(e) =>
                          setSelectedAutoId(e.target.value || null)
                        }
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
                          const pool = autoSnapshots.slice(
                            Math.max(autoSnapshots.length - 5, 0)
                          );
                          const sel =
                            pool.find((s) => s.id === selectedAutoId) ||
                            pool[pool.length - 1];
                          return `${new Date(sel.ts).toLocaleTimeString()} · ${
                            sel.title
                          }`;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Realm (single version: archive if none, otherwise restore board + cemetery) */}
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
              <button
                className={realmBtnClass}
                onClick={handleArchiveOrRestoreRealm}
                title={realmBtnText}
              >
                {realmBtnText}
              </button>
            </div>
          </div>
        </div>
      )}

      {peekDialog ? (
        <HandPeekDialog
          title={peekDialog.title ?? ""}
          cards={peekDialog.cards}
          source={peekDialog.source}
          onClose={closePeekDialog}
        />
      ) : null}
      {d20Open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="relative w-[92vw] sm:w-full max-w-md bg-zinc-900/90 rounded-2xl ring-1 ring-white/10 shadow-2xl p-4 sm:p-6 text-white"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold">
                Toolbox D20 Roll
              </h3>
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
              <Canvas camera={{ position: [0, 5, 0], fov: 50, up: [0, 0, -1] }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[2, 5, 2]} intensity={0.8} />
                <D20Dice
                  playerName=""
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
                    }, 3200);
                  }}
                />
              </Canvas>
            </div>
          </div>
        </div>
      )}
      {d6Open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="relative w-[92vw] sm:w-full max-w-md bg-zinc-900/90 rounded-2xl ring-1 ring-white/10 shadow-2xl p-4 sm:p-6 text-white"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold">
                Toolbox D6 Roll
              </h3>
              <button
                className="text-sm text-zinc-400 hover:text-white"
                onClick={() => {
                  setD6Open(false);
                  setD6Rolling(false);
                  setD6Value(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="bg-black/40 rounded-xl ring-1 ring-white/10 h-[42vh] min-h-[240px] sm:h-[260px]">
              <Canvas camera={{ position: [0, 5, 0], fov: 50, up: [0, 0, -1] }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[2, 5, 2]} intensity={0.8} />
                <D6Dice
                  playerName=""
                  player={mySeat ?? "p1"}
                  position={[0, 0, 0]}
                  roll={d6Value}
                  isRolling={d6Rolling}
                  onRollComplete={() => {
                    setD6Rolling(false);
                    // Leave the result visible briefly before auto-closing
                    setTimeout(() => {
                      setD6Open(false);
                      setD6Value(null);
                    }, 3200);
                  }}
                />
              </Canvas>
            </div>
          </div>
        </div>
      )}
      {cardSearchOpen && (
        <CardSearchDialog
          onSelectCard={handleSearchAndDraw}
          onClose={() => setCardSearchOpen(false)}
        />
      )}
    </div>
  );
}
