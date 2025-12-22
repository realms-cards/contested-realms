"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import BrowseOverlay from "@/components/game/BrowseOverlay";
import CardPreview from "@/components/game/CardPreview";
import ChaosTwisterOverlay from "@/components/game/ChaosTwisterOverlay";
import { ElementChoiceOverlay } from "@/components/game/ElementChoiceOverlay";
import CommonSenseOverlay from "@/components/game/CommonSenseOverlay";
import MorganaHandOverlay from "@/components/game/MorganaHandOverlay";
import OmphalosHandOverlay from "@/components/game/OmphalosHandOverlay";
import PithImpOverlay from "@/components/game/PithImpOverlay";
import PrivateHandTargetingOverlay from "@/components/game/PrivateHandTargetingOverlay";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import CollectionButton from "@/components/game/CollectionButton";
import ContextMenu from "@/components/game/ContextMenu";
import DeckSelector from "@/components/game/DeckSelector";
import GameToolbox from "@/components/game/GameToolbox";
import HarbingerPortalScreen from "@/components/game/HarbingerPortalScreen";
import { InteractionConsentDialog } from "@/components/game/InteractionConsentDialog";
import LifeCounters from "@/components/game/LifeCounters";
import MobileHandHint from "@/components/game/MobileHandHint";
import OfflineMulliganScreen from "@/components/game/OfflineMulliganScreen";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import PlacementDialog from "@/components/game/PlacementDialog";
import PlayerResourcePanels from "@/components/game/PlayerResourcePanel";
import SeerScreen from "@/components/game/SeerScreen";
import StatusBar from "@/components/game/StatusBar";
import SwitchSiteHudOverlay from "@/components/game/SwitchSiteHudOverlay";
import {
  DynamicBoard as Board,
  DynamicHand3D as Hand3D,
  DynamicHud3D as Hud3D,
  DynamicPiles3D as Piles3D,
  DynamicTokenPile3D as TokenPile3D,
} from "@/components/game/dynamic-3d";
import KeyboardShortcutsHelp, {
  useHelpShortcut,
} from "@/components/ui/KeyboardShortcutsHelp";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import {
  hasAnyHarbinger,
  detectHarbingerSeats,
} from "@/lib/game/avatarAbilities";
import { createCardPreviewData } from "@/lib/game/card-preview.types";
import TextureCache from "@/lib/game/components/TextureCache";
import {
  MAT_PIXEL_W,
  MAT_PIXEL_H,
  BASE_TILE_SIZE,
  MAT_RATIO,
  PLAYER_COLORS,
} from "@/lib/game/constants";
import {
  saveHotseatGame,
  loadHotseatGame,
  clearHotseatGame,
  hasSavedHotseatGame,
  applyLoadedGame,
} from "@/lib/game/hotseatPersistence";
import { Physics } from "@/lib/game/physics";
import { useGameStore } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { useZoomKeyboardShortcuts } from "@/lib/hooks/useZoomKeyboardShortcuts";
import { LocalTransport } from "@/lib/net/localTransport";

export default function PlayPage() {
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const previewCard = useGameStore((s) => s.previewCard);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);
  const contextMenu = useGameStore((s) => s.contextMenu);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const selected = useGameStore((s) => s.selectedCard);
  const events = useGameStore((s) => s.events);
  const setPhase = useGameStore((s) => s.setPhase);
  const phase = useGameStore((s) => s.phase);
  const placementDialog = useGameStore((s) => s.placementDialog);
  const closePlacementDialog = useGameStore((s) => s.closePlacementDialog);
  const searchDialog = useGameStore((s) => s.searchDialog);
  const closeSearchDialog = useGameStore((s) => s.closeSearchDialog);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const players = useGameStore((s) => s.players);
  const avatars = useGameStore((s) => s.avatars);
  const portalState = useGameStore((s) => s.portalState);
  const initPortalState = useGameStore((s) => s.initPortalState);
  const boardSize = useGameStore((s) => s.board.size);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const setCameraMode = useGameStore((s) => s.setCameraMode);
  const currentPlayerKey = currentPlayer === 1 ? "p1" : "p2";
  const offlinePlayerNames = useMemo(
    () => ({ p1: "Player 1", p2: "Player 2" }),
    []
  );
  const offlineNameById = useMemo(
    () => ({ hotseat_p1: "Player 1", hotseat_p2: "Player 2" }),
    []
  );
  const consentPlayerId = currentPlayerKey
    ? (`hotseat_${currentPlayerKey}` satisfies string)
    : "hotseat";
  const showToolbox = phase !== "Setup";

  // Setup state - declared early so effects can reference them
  const [setupOpen, setSetupOpen] = useState<boolean>(true);
  const [prepared, setPrepared] = useState<boolean>(false);
  const [consoleOpen, setConsoleOpen] = useState<boolean>(false);
  // Hotseat: Player 1 performs mulligans for both players; start after both are ready
  const [p1Ready, setP1Ready] = useState<boolean>(false);
  const [p2Ready, setP2Ready] = useState<boolean>(false);

  // Harbinger portal phase state (Gothic expansion)
  // Portal phase happens AFTER mulligan, before game starts
  const [mulliganComplete, setMulliganComplete] = useState<boolean>(false);
  // Seer state from game store (synced)
  const seerState = useGameStore((s) => s.seerState);
  // Second player seer phase - derived from synced seerState
  const seerComplete = seerState?.setupComplete ?? false;
  const [needsPortalPhase, setNeedsPortalPhase] = useState<boolean>(false);
  const [portalSetupComplete, setPortalSetupComplete] =
    useState<boolean>(false);
  const [portalPhaseInitialized, setPortalPhaseInitialized] =
    useState<boolean>(false);

  // Saved game restoration prompt
  const [showRestorePrompt, setShowRestorePrompt] = useState<boolean>(false);
  const [, setRestoredGame] = useState<boolean>(false);

  // Keyboard shortcuts help overlay
  const [helpOpen, setHelpOpen] = useHelpShortcut();

  // LocalTransport wiring for offline play
  const transportRef = useRef<LocalTransport | null>(null);
  const transport = useMemo(() => {
    if (!transportRef.current) transportRef.current = new LocalTransport();
    return transportRef.current;
  }, []);

  // Batch incoming server patches to a single RAF to avoid rapid re-entrancy
  const patchQueueRef = useRef<Array<{ patch: unknown; t?: number }>>([]);
  const patchFlushScheduledRef = useRef<boolean>(false);
  const queueServerPatch = (patch: unknown, t?: number) => {
    patchQueueRef.current.push({ patch, t });
    if (patchFlushScheduledRef.current) return;
    patchFlushScheduledRef.current = true;
    requestAnimationFrame(() => {
      patchFlushScheduledRef.current = false;
      const items = patchQueueRef.current;
      patchQueueRef.current = [];
      for (const it of items) {
        try {
          useGameStore.getState().applyServerPatch(it.patch, it.t);
        } catch (e) {
          try {
            console.warn("applyServerPatch failed", e);
          } catch {}
        }
      }
    });
  };

  // Track if we've checked for saved game
  const [checkedForSavedGame, setCheckedForSavedGame] = useState(false);

  // Check for saved game on mount and show restore prompt
  useEffect(() => {
    (async () => {
      const hasSaved = await hasSavedHotseatGame();
      console.log("[hotseat] Checking for saved game:", hasSaved);
      if (hasSaved) {
        setShowRestorePrompt(true);
      } else {
        // No saved game, reset state for new game
        useGameStore.getState().resetGameState();
      }
      setCheckedForSavedGame(true);
    })();
  }, []);

  // Handle restore or new game decision
  const handleNewGame = useCallback(async () => {
    console.log("[hotseat] Starting new game");
    await clearHotseatGame();
    useGameStore.getState().resetGameState();
    setShowRestorePrompt(false);
  }, []);

  const handleRestoreGame = useCallback(async () => {
    console.log("[hotseat] Restoring saved game");
    const saved = await loadHotseatGame();
    if (saved) {
      console.log("[hotseat] Loaded saved game:", saved);
      const state = useGameStore.getState();
      const updates = applyLoadedGame(state, saved);
      useGameStore.setState(updates);
      setSetupOpen(false);
      setPrepared(true);
      setP1Ready(true);
      setP2Ready(true);
      setMulliganComplete(saved.mulliganComplete);
      setPortalSetupComplete(saved.portalSetupComplete);
      setRestoredGame(true);
      setShowRestorePrompt(false);
    } else {
      console.log("[hotseat] No saved game found, starting new");
      await handleNewGame();
    }
  }, [handleNewGame]);

  // Inject transport into store once; remove on unmount
  useEffect(() => {
    useGameStore.getState().setTransport(transport);
    return () => {
      try {
        useGameStore.getState().setTransport(null);
      } catch {}
    };
  }, [transport]);

  // Connect LocalTransport and subscribe to events
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        let displayName = "Offline Player";
        try {
          displayName =
            localStorage.getItem("sorcery:playerName") || displayName;
        } catch {}
        await transport.connect({ displayName });
      } catch (e) {
        try {
          console.warn("LocalTransport connect failed", e);
        } catch {}
      }
    })();

    unsubscribers.push(
      transport.on("statePatch", (p) => {
        queueServerPatch(p.patch, p.t);
      }),
      transport.on("resync", (p) => {
        const snap = p.snapshot as { game?: unknown; t?: number };
        if (snap?.game) {
          queueServerPatch(
            snap.game,
            typeof snap.t === "number" ? snap.t : undefined
          );
        }
      }),
      transport.on("error", (p) => {
        try {
          console.warn("local transport error", p);
        } catch {}
      })
    );

    return () => {
      unsubscribers.forEach((u) => u());
      transport.disconnect();
    };
  }, [transport]);

  // After mulligan complete, check for Harbinger avatars and initialize portal state
  useEffect(() => {
    if (!mulliganComplete || portalPhaseInitialized) return;
    setPortalPhaseInitialized(true);

    // Check if any player has a Harbinger avatar
    if (avatars && hasAnyHarbinger(avatars)) {
      const harbingerSeats = detectHarbingerSeats(avatars);
      if (harbingerSeats.length > 0) {
        setNeedsPortalPhase(true);
        initPortalState(harbingerSeats);
        return;
      }
    }
    // No Harbingers, skip portal phase
    setPortalSetupComplete(true);
  }, [mulliganComplete, portalPhaseInitialized, avatars, initPortalState]);

  // Mark portal phase complete when portalState indicates completion
  useEffect(() => {
    if (
      needsPortalPhase &&
      portalState?.setupComplete &&
      !portalSetupComplete
    ) {
      setPortalSetupComplete(true);
    }
  }, [needsPortalPhase, portalState?.setupComplete, portalSetupComplete]);

  // Event console: autoscroll and text formatting
  const eventsRef = useRef<HTMLDivElement | null>(null);
  // Camera controls ref for reset functionality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  function formatEventText(text: string): React.ReactNode {
    // Redact opponent (P2) drawn card names while preserving the rest
    let processedText = text || "";
    // Case 1: P2 draws 'Card Name' ...
    processedText = processedText.replace(/^(P2 draws )'[^']+'/i, "$1a card");
    // Case 2: Cannot draw 'Card Name' ...: P2 is not the current player
    processedText = processedText.replace(
      /^Cannot draw '.*?'( from .+: P2 is not the current player)$/i,
      "Cannot draw a card$1"
    );

    // Parse and render [pX:PLAYER] and [pXcard:CardName] placeholders with colors
    const parts: React.ReactNode[] = [];
    const regex = /\[(p[12])(card)?:([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(processedText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(processedText.slice(lastIndex, match.index));
      }
      // Add the colored name/card
      const playerKey = match[1] as "p1" | "p2";
      const isCard = match[2] === "card";
      let displayText = match[3];

      // Replace PLAYER placeholder with P1/P2 for hotseat
      if (displayText === "PLAYER") {
        displayText = playerKey.toUpperCase();
      }

      parts.push(
        <span
          key={key++}
          style={{ color: PLAYER_COLORS[playerKey], fontWeight: 500 }}
          className={isCard ? "font-fantaisie" : undefined}
        >
          {displayText}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < processedText.length) {
      parts.push(processedText.slice(lastIndex));
    }

    return parts.length > 0 ? parts : processedText;
  }

  // Autoscroll to latest event when events change or console opens
  useEffect(() => {
    if (!consoleOpen) return;
    const el = eventsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length, consoleOpen]);

  // Robust: reset drag flags and stuck interaction states on hard-cancel contexts
  useEffect(() => {
    const reset = (reason?: string) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[drag] reset via ${reason || "unknown"}`);
      }
      // Defer to allow any drop/pointerup handlers to run first
      setTimeout(() => {
        setDragFromHand(false);
        setDragFromPile(null);
        // Also clear any stuck combat/magic states that could block avatar movement
        const state = useGameStore.getState();
        if (state.attackChoice) state.setAttackChoice(null);
        if (state.attackTargetChoice) state.setAttackTargetChoice(null);
        if (state.attackConfirm) state.setAttackConfirm(null);
        if (state.pendingMagic) state.cancelMagic?.();
      }, 0);
    };

    const onPointerCancel = () => reset("pointercancel");
    const onBlur = () => reset("blur");
    const onVisibility = () => {
      if (document.visibilityState !== "visible") reset("visibilitychange");
    };
    const onPageHide = () => reset("pagehide");

    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [setDragFromHand, setDragFromPile]);

  const startGame = useCallback(() => {
    setSetupOpen(false);
    setPhase("Main");
  }, [setPhase]);

  // When both players confirm mulligan, finalize and check for portal phase
  useEffect(() => {
    if (prepared && p1Ready && p2Ready && !mulliganComplete) {
      try {
        useGameStore.getState().finalizeMulligan();
      } catch {}
      setMulliganComplete(true);
    }
  }, [prepared, p1Ready, p2Ready, mulliganComplete]);

  // Start game after portal phase is complete (or immediately if no Harbinger)
  useEffect(() => {
    if (mulliganComplete && portalSetupComplete) {
      startGame();
    }
  }, [mulliganComplete, portalSetupComplete, startGame]);

  // Auto-save game state to localStorage when game is in progress
  // Subscribe to store changes and debounce saves
  const saveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    // Only set up auto-save after setup is complete
    if (setupOpen || phase === "Setup") return;

    const doSave = () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        const state = useGameStore.getState();
        saveHotseatGame(state, true, mulliganComplete, portalSetupComplete);
      }, 1000) as unknown as number;
    };

    // Subscribe to store changes
    const unsubscribe = useGameStore.subscribe(doSave);

    // Initial save
    doSave();

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [setupOpen, phase, mulliganComplete, portalSetupComplete]);

  // Compute playmat world extents from board size for camera clamping
  // (moved up so gotoBaseline can use matW/matH)
  const baseGridW = boardSize.w * BASE_TILE_SIZE;
  const baseGridH = boardSize.h * BASE_TILE_SIZE;
  let matW = baseGridW;
  let matH = baseGridW / MAT_RATIO;
  if (matH < baseGridH) {
    matH = baseGridH;
    matW = baseGridH * MAT_RATIO;
  }

  // Natural tilt angle for 2D mode (matches online play)
  const naturalTiltAngle = useMemo(() => 0.14, []);

  // Preserve camera zoom/tilt across turn switches in hotseat mode
  const savedCameraRef = useRef<{
    distance: number;
    polarAngle: number;
  } | null>(null);

  // Save current camera distance and polar angle
  const saveCameraState = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    const cam = c.object as THREE.Camera;
    const offset = cam.position.clone().sub(c.target);
    const distance = offset.length();
    const spherical = new THREE.Spherical().setFromVector3(offset);
    savedCameraRef.current = { distance, polarAngle: spherical.phi };
  }, []);

  const gotoBaseline = useCallback(
    (mode: "topdown" | "orbit", preserveZoomTilt = false) => {
      const c = controlsRef.current;
      if (!c) return;
      c.target.set(0, 0, 0);
      const cam = c.object as THREE.Camera;

      // Use saved camera state if preserving, otherwise use defaults
      const saved = preserveZoomTilt ? savedCameraRef.current : null;

      if (mode === "topdown") {
        // Natural 2D view: almost top-down from the current player's side, slightly tilted
        const defaultDist = Math.max(matW, matH) * 1.1;
        const dist = saved?.distance ?? defaultDist;
        const tilt = saved?.polarAngle ?? naturalTiltAngle;
        // Player 2 views from opposite side (negative Z)
        const sign = currentPlayer === 2 ? -1 : 1;
        cam.position.set(
          0,
          Math.cos(tilt) * dist,
          sign * Math.sin(tilt) * dist
        );
        cam.up.set(0, 1, 0);
      } else {
        // 3D orbit mode - preserve distance and polar angle if available
        const defaultDist = Math.hypot(10, 5); // ~11.18
        const defaultPhi = Math.atan2(10, 5); // ~1.107 radians
        const dist = saved?.distance ?? defaultDist;
        const phi = saved?.polarAngle ?? defaultPhi;
        // Azimuth: P1 looks from +Z, P2 from -Z
        const theta = currentPlayer === 2 ? Math.PI : 0;
        const spherical = new THREE.Spherical(dist, phi, theta);
        const offset = new THREE.Vector3().setFromSpherical(spherical);
        cam.position.copy(c.target).add(offset);
        cam.up.set(0, 1, 0);
      }
      cam.lookAt(0, 0, 0);
      c.update();
    },
    [currentPlayer, matW, matH, naturalTiltAngle]
  );

  const resetCamera = useCallback(() => {
    gotoBaseline(cameraMode);
  }, [gotoBaseline, cameraMode]);

  // Track previous player to detect turn switches
  const prevPlayerRef = useRef<number>(currentPlayer);

  // When switching seats (currentPlayer changes), rotate camera to the new player's perspective
  // but preserve zoom/tilt so users don't have to re-adjust every turn
  useEffect(() => {
    const isTurnSwitch = prevPlayerRef.current !== currentPlayer;
    prevPlayerRef.current = currentPlayer;

    // Save camera state before switching if this is a turn switch
    if (isTurnSwitch && controlsRef.current) {
      saveCameraState();
    }

    const id = requestAnimationFrame(() => {
      if (!controlsRef.current) {
        setTimeout(() => gotoBaseline(cameraMode, isTurnSwitch), 0);
      } else {
        gotoBaseline(cameraMode, isTurnSwitch);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [cameraMode, gotoBaseline, currentPlayer, saveCameraState]);

  // Tab key to reset camera (matches online play behavior)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.tagName === "BUTTON")
      ) {
        return;
      }
      e.preventDefault();
      resetCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetCamera]);

  // Keyboard shortcut: P to toggle card previews
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      // Ignore if typing in input fields
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        return;
      }
      e.preventDefault();
      toggleCardPreviews();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCardPreviews]);

  // Determine if camera panning should be enabled
  const canPanCamera =
    !dragFromHand &&
    !dragFromPile &&
    !selected &&
    !selectedPermanent &&
    !selectedAvatar;

  // Dynamic page title for offline play
  useEffect(() => {
    const baseTitle = "Realms.cards";

    if (setupOpen) {
      document.title = `${baseTitle} - Game Setup`;
      return;
    }

    const p1Life = players.p1?.life;
    const p2Life = players.p2?.life;

    let title = `${baseTitle} - Offline`;

    // Add life info if available
    if (p1Life !== undefined && p2Life !== undefined) {
      title += ` (P1: ${p1Life} vs P2: ${p2Life})`;
    }

    // Add turn info
    title += ` - P${currentPlayer}'s Turn`;

    document.title = title;
  }, [setupOpen, players.p1?.life, players.p2?.life, currentPlayer]);

  const minDist = Math.max(1, Math.min(matW, matH) * 0.15);
  const maxDist = Math.max(14, Math.hypot(matW, matH) * 1.3);
  const clampControls = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    const halfW = matW / 2;
    const halfH = matH / 2;
    const t = c.target;
    const cam = (c as unknown as { object: THREE.PerspectiveCamera }).object;
    const offset = cam.position.clone().sub(t.clone());
    let changed = false;
    if (t.x < -halfW) {
      t.x = -halfW;
      changed = true;
    } else if (t.x > halfW) {
      t.x = halfW;
      changed = true;
    }
    if (t.z < -halfH) {
      t.z = -halfH;
      changed = true;
    } else if (t.z > halfH) {
      t.z = halfH;
      changed = true;
    }
    if (t.y !== 0) {
      t.y = 0;
      changed = true;
    }

    // Prevent camera from getting into extreme positions that cause rotation flips.
    // Clamp the camera's absolute XZ position to prevent gimbal-lock-like behavior
    // when panning far from the board while zoomed out.
    const camBoundX = halfW + maxDist * 1.5;
    const camBoundZ = halfH + maxDist * 1.5;
    if (cam.position.x < -camBoundX) {
      cam.position.x = -camBoundX;
      t.x = cam.position.x - offset.x;
      changed = true;
    } else if (cam.position.x > camBoundX) {
      cam.position.x = camBoundX;
      t.x = cam.position.x - offset.x;
      changed = true;
    }
    if (cam.position.z < -camBoundZ) {
      cam.position.z = -camBoundZ;
      t.z = cam.position.z - offset.z;
      changed = true;
    } else if (cam.position.z > camBoundZ) {
      cam.position.z = camBoundZ;
      t.z = cam.position.z - offset.z;
      changed = true;
    }
    // Ensure camera Y stays positive (above the board) to prevent flip
    if (cam.position.y < 0.5) {
      cam.position.y = 0.5;
      changed = true;
    }

    if (changed) {
      cam.position.copy(t.clone().add(offset));
      c.update();
    }
  }, [matW, matH, maxDist]);

  return (
    <div className="relative h-screen [height:100dvh] w-full select-none">
      {/* Camera mode toggle */}
      <div className="absolute top-2 left-2 z-30">
        <div className="bg-black/50 rounded-lg p-1 ring-1 ring-white/10">
          <button
            className={`px-2 py-1 text-xs rounded ${
              cameraMode === "topdown"
                ? "bg-white/20"
                : "bg-transparent hover:bg-white/10"
            }`}
            onClick={() => {
              setCameraMode("topdown");
              gotoBaseline("topdown");
            }}
            title="Top-down 2D camera"
          >
            2D
          </button>
          <button
            className={`ml-1 px-2 py-1 text-xs rounded ${
              cameraMode === "orbit"
                ? "bg-white/20"
                : "bg-transparent hover:bg-white/10"
            }`}
            onClick={() => {
              setCameraMode("orbit");
              gotoBaseline("orbit");
            }}
            title="3D orbit camera"
          >
            3D
          </button>
        </div>
      </div>
      {/* Restore Game Prompt */}
      {showRestorePrompt && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md text-center ring-1 ring-white/20 shadow-xl">
            <h2 className="text-xl font-semibold text-white mb-4">
              Resume Previous Game?
            </h2>
            <p className="text-gray-300 mb-6">
              A saved hotseat game was found. Would you like to continue where
              you left off?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleNewGame}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Start New Game
              </button>
              <button
                onClick={handleRestoreGame}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Resume Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Overlay - only show after we've checked for saved game */}
      {setupOpen && !showRestorePrompt && checkedForSavedGame && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          {!prepared ? (
            <DeckSelector
              onPrepareComplete={() => {
                // Clear any old saved game when starting fresh through deck selection
                clearHotseatGame();
                setPrepared(true);
              }}
            />
          ) : !mulliganComplete ? (
            /* Mulligan phase - sequential: P1 first, then P2 */
            !p1Ready ? (
              <OfflineMulliganScreen
                key="mulligan-p1"
                myPlayerKey="p1"
                playerNames={{ p1: "Player 1", p2: "Player 2" }}
                finalizeLabel="Confirm Mulligan"
                onStartGame={() => setP1Ready(true)}
              />
            ) : (
              <OfflineMulliganScreen
                key="mulligan-p2"
                myPlayerKey="p2"
                playerNames={{ p1: "Player 1", p2: "Player 2" }}
                finalizeLabel="Confirm Mulligan"
                onStartGame={() => setP2Ready(true)}
              />
            )
          ) : !seerComplete ? (
            /* Second Player Seer phase - P2 gets to scry after mulligan */
            <SeerScreen
              myPlayerKey="p2"
              playerNames={{ p1: "Player 1", p2: "Player 2" }}
              onSeerComplete={() => {
                // seerComplete is derived from synced seerState.setupComplete
                // The SeerScreen handles the state update via completeSeer()
              }}
            />
          ) : needsPortalPhase && !portalSetupComplete ? (
            /* Harbinger portal phase - after mulligan, before game starts */
            <HarbingerPortalScreen
              myPlayerKey={portalState?.currentRoller ?? "p1"}
              playerNames={{ p1: "Player 1", p2: "Player 2" }}
              onSetupComplete={() => setPortalSetupComplete(true)}
            />
          ) : (
            /* Waiting for portal phase to complete */
            <div className="text-center text-white">
              <div className="animate-pulse">Starting game...</div>
            </div>
          )}
        </div>
      )}

      <InteractionConsentDialog
        myPlayerId={consentPlayerId}
        mySeat={currentPlayerKey}
        playerNames={offlinePlayerNames}
        playerNameById={offlineNameById}
      />

      {/* Switch Site HUD Overlay */}
      <SwitchSiteHudOverlay />

      {/* Chaos Twister Overlay (dexterity minigame) */}
      <ChaosTwisterOverlay />

      {/* Element Choice Overlay (Valley of Delight, etc.) */}
      <ElementChoiceOverlay />

      {/* Browse Overlay (spell selection) */}
      <BrowseOverlay />

      {/* Common Sense Overlay (search for Ordinary card) */}
      <CommonSenseOverlay />

      {/* Morgana le Fay private hand overlay */}
      <MorganaHandOverlay />

      {/* Omphalos private hand overlay */}
      <OmphalosHandOverlay />

      {/* Pith Imp stolen card notification */}
      <PithImpOverlay />

      {/* Private hand targeting overlay (Morgana/Omphalos) */}
      <PrivateHandTargetingOverlay />

      {/* Toolbox and Collection buttons (bottom-right) */}
      {showToolbox && (
        <div className="absolute bottom-3 right-3 z-20 flex items-end gap-2">
          <CollectionButton mySeat={currentPlayerKey} />
          <GameToolbox
            myPlayerId={null}
            mySeat={currentPlayerKey}
            opponentPlayerId={null}
            opponentSeat={currentPlayerKey === "p1" ? "p2" : "p1"}
            matchId={null}
          />
        </div>
      )}

      {/* HUD */}
      <StatusBar dragFromHand={dragFromHand} />

      <LifeCounters dragFromHand={dragFromHand} />

      {/* Mana and Thresholds panel on the right */}
      <PlayerResourcePanels
        myPlayerKey="p1"
        playerNames={{ p1: "Player 1", p2: "Player 2" }}
        showYouLabels={false}
        readOnly={false}
        dragFromHand={dragFromHand}
      />

      {/* Event Console */}
      <div
        className={`absolute left-3 bottom-2 z-10 ${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } text-white w-80`}
      >
        <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-semibold opacity-90">Console</span>
            <button
              className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs"
              onClick={() => setConsoleOpen((o) => !o)}
            >
              {consoleOpen ? "Collapse" : "Expand"}
            </button>
          </div>
          {consoleOpen && (
            <div
              ref={eventsRef}
              className="max-h-64 overflow-y-auto px-3 pb-3 text-xs space-y-1"
            >
              {events.length === 0 && (
                <div className="opacity-60">No events yet</div>
              )}
              {events.slice(-100).map((ev, idx) => {
                const t = ev.text || "";
                const low = t.toLowerCase();
                // Detect warnings: messages starting with [warning], warning, cannot, or other error patterns
                const isWarn =
                  low.startsWith("[warning]") ||
                  low.startsWith("warning") ||
                  low.startsWith("cannot") ||
                  low.includes("cannot") ||
                  low.startsWith("insufficient") ||
                  low.startsWith("first site must") ||
                  low.startsWith("new sites must") ||
                  low.startsWith("sites cannot") ||
                  low.startsWith("permanents can only") ||
                  low.startsWith("avatar must");
                const isSearch = low.startsWith("search:");
                return (
                  <div
                    key={`${ev.id}-${ev.ts}-${idx}`}
                    className={`opacity-85 ${
                      isWarn
                        ? "text-yellow-400"
                        : isSearch
                        ? "text-blue-400"
                        : ""
                    }`}
                  >
                    • {formatEventText(ev.text)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hover Preview Overlay (hidden if context menu visible or previews disabled) */}
      {cardPreviewsEnabled && previewCard && !contextMenu && (
        <CardPreview
          card={createCardPreviewData({
            slug: previewCard.slug,
            name: previewCard.name,
            type: previewCard.type,
          })}
          anchor="top-right"
        />
      )}

      {contextMenu && (
        <ContextMenu
          onClose={() => {
            clearSelection();
            setPreviewCard(null);
            closeContextMenu();
          }}
        />
      )}

      {/* Global dialogs */}
      {placementDialog && (
        <PlacementDialog
          cardName={placementDialog.cardName}
          pileName={placementDialog.pileName}
          onChoice={(pos) => {
            placementDialog.onPlace(pos);
            closePlacementDialog();
          }}
          onCancel={() => closePlacementDialog()}
        />
      )}

      {searchDialog && (
        <PileSearchDialog
          pileName={searchDialog.pileName}
          cards={searchDialog.cards}
          onSelectCard={(card) => {
            searchDialog.onSelectCard(card);
            closeSearchDialog();
          }}
          onClose={() => closeSearchDialog()}
          onBanishCard={
            searchDialog.onBanishCard
              ? (card) => {
                  searchDialog.onBanishCard?.(card);
                  closeSearchDialog();
                }
              : undefined
          }
          banishRequiresConsent={searchDialog.banishRequiresConsent}
        />
      )}

      {/* Replaced 2D overlays with 3D piles and hand inside Canvas */}

      {/* Board */}
      <ClientCanvas
        camera={{ position: [0, 10, 0], fov: 50 }}
        shadows
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: false,
        }}
        onPointerMissed={() => {
          // Don't clear selection during drags to prevent orbit interference
          if (!dragFromHand && !dragFromPile) {
            clearSelection();
            closeContextMenu();
            setPreviewCard(null);
          }
        }}
      >
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
          shadow-bias={-0.0001}
        />

        {/* Interactive board (physics-enabled) */}
        <Physics gravity={[0, -9.81, 0]}>
          <Board enableBoardPings />
        </Physics>

        {/* 3D Piles (sides of the board) */}
        <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        {/* Token piles (face-up) */}
        <TokenPile3D owner="p1" />
        <TokenPile3D owner="p2" />

        {/* 3D HUD (thresholds, life, mana) */}
        <Hud3D owner="p1" />
        <Hud3D owner="p2" />

        {/* 3D Hand anchored to the camera (current player) */}
        <Hand3D
          owner={currentPlayerKey}
          matW={MAT_PIXEL_W}
          matH={MAT_PIXEL_H}
        />

        {/* Invisible texture cache for smooth loading */}
        <TextureCache />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[0, 0, 0]}
          mouseButtons={{
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          touches={{ TWO: THREE.TOUCH.PAN }}
          enabled={canPanCamera}
          enablePan={canPanCamera}
          enableRotate={canPanCamera && cameraMode !== "topdown"}
          enableZoom={!dragFromHand && !dragFromPile}
          enableDamping={false}
          onChange={clampControls}
          minDistance={minDist}
          maxDistance={maxDist}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.4}
        />
        <KeyboardPanControls enabled={canPanCamera} />
        <TrackpadOrbitAdapter />
      </ClientCanvas>

      {/* Mobile hand interaction hint */}
      <MobileHandHint />

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        context="game"
      />
    </div>
  );
}

function KeyboardPanControls({
  enabled = true,
  step = 0.4,
}: {
  enabled?: boolean;
  step?: number;
}) {
  const { controls } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled, panStep: step });
  useZoomKeyboardShortcuts(controls, { enabled });
  return null;
}
