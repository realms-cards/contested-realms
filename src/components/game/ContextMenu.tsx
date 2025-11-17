"use client";

import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  detectBurrowSubmergeAbilities,
  detectBurrowSubmergeAbilitiesSync,
  detectRangedAbilitySync,
} from "@/lib/game/cardAbilities";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";
import {
  getCellNumber,
  parseCellKey,
  seatFromOwner,
  toCellKey,
  opponentOwner,
} from "@/lib/game/store/utils/boardHelpers";
import type { ContextMenuAction } from "@/lib/game/types";

interface ContextMenuProps {
  onClose: () => void;
}

export default function ContextMenu({ onClose }: ContextMenuProps) {
  const { playCardFlip, playCardShuffle, playCardSelect } = useSound();
  const contextMenu = useGameStore((s) => s.contextMenu);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const zones = useGameStore((s) => s.zones);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const actorKey = useGameStore((s) => s.actorKey);
  const toggleTapPermanent = useGameStore((s) => s.toggleTapPermanent);
  const setAttackTargetChoice = useGameStore((s) => s.setAttackTargetChoice);
  const addCounterOnPermanent = useGameStore((s) => s.addCounterOnPermanent);
  const clearPermanentCounter = useGameStore((s) => s.clearPermanentCounter);
  const addCounterOnAvatar = useGameStore((s) => s.addCounterOnAvatar);
  const clearAvatarCounter = useGameStore((s) => s.clearAvatarCounter);
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
  const attachTokenToTopPermanent = useGameStore(
    (s) => s.attachTokenToTopPermanent
  );
  const attachTokenToPermanent = useGameStore((s) => s.attachTokenToPermanent);
  const attachPermanentToAvatar = useGameStore(
    (s) => s.attachPermanentToAvatar
  );
  const detachToken = useGameStore((s) => s.detachToken);
  const log = useGameStore((s) => s.log);

  // Permanent position management (burrow/submerge)
  const getAvailableActions = useGameStore((s) => s.getAvailableActions);
  const updatePermanentState = useGameStore((s) => s.updatePermanentState);
  const setPermanentAbility = useGameStore((s) => s.setPermanentAbility);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null
  );
  const [positionActions, setPositionActions] = useState<ContextMenuAction[]>(
    []
  );
  // Extra combat actions computed per-open menu (do not store in state to avoid duplication)
  const extraActions: ContextMenuAction[] = [];

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

  // Handle permanent ability setup and position actions
  useEffect(() => {
    if (!contextMenu) {
      setPositionActions([]);
      return;
    }

    const t = contextMenu.target;
    if (t.kind === "permanent") {
      const item = permanents[t.at]?.[t.index];
      if (item?.card) {
        const permanentId =
          item?.card?.cardId ?? parseInt(t.at.split(",")[0]) * 1000 + t.index;

        // Fetch abilities asynchronously from API
        (async () => {
          try {
            const abilities = await detectBurrowSubmergeAbilities(
              item.card.name
            );
            const canBurrow = abilities.canBurrow;
            const canSubmerge = abilities.canSubmerge;

            if (canBurrow || canSubmerge) {
              setPermanentAbility(permanentId, {
                permanentId,
                canBurrow,
                canSubmerge,
                requiresWaterSite: canSubmerge, // Submerge typically requires water sites
                abilitySource: `${item.card.name} - ${
                  canBurrow && canSubmerge
                    ? "Burrowing/Submerge"
                    : canBurrow
                    ? "Burrowing"
                    : "Submerge"
                } ability`,
              });

              // Initialize position data if it doesn't exist - permanent starts on surface
              const state = useGameStore.getState();
              if (!state.permanentPositions[permanentId]) {
                state.setPermanentPosition(permanentId, {
                  permanentId,
                  state: "surface",
                  position: {
                    x: 0, // Default position - will be updated by actual game logic
                    y: 0,
                    z: 0,
                  },
                });
              }
            }

            // Get available position actions after abilities are set
            const actions = getAvailableActions(permanentId);
            console.log("Debug - Permanent ID:", permanentId);
            console.log("Debug - Available actions:", actions);
            console.log("Debug - Abilities set:", { canBurrow, canSubmerge });

            // Debug store state
            const state = useGameStore.getState();
            console.log(
              "Debug - Position data:",
              state.permanentPositions[permanentId]
            );
            console.log(
              "Debug - Ability data:",
              state.permanentAbilities[permanentId]
            );
            console.log(
              "Debug - All positions:",
              Object.keys(state.permanentPositions)
            );
            console.log(
              "Debug - All abilities:",
              Object.keys(state.permanentAbilities)
            );

            setPositionActions(actions);
          } catch (error) {
            console.warn(
              "Failed to fetch abilities for",
              item.card.name,
              error
            );
            // Fallback to sync detection as backup
            const abilities = detectBurrowSubmergeAbilitiesSync(item.card.name);
            const canBurrow = abilities.canBurrow;
            const canSubmerge = abilities.canSubmerge;

            if (canBurrow || canSubmerge) {
              setPermanentAbility(permanentId, {
                permanentId,
                canBurrow,
                canSubmerge,
                requiresWaterSite: canSubmerge,
                abilitySource: `${item.card.name} - ${
                  canBurrow && canSubmerge
                    ? "Burrowing/Submerge"
                    : canBurrow
                    ? "Burrowing"
                    : "Submerge"
                } ability`,
              });

              // Initialize position data if it doesn't exist - permanent starts on surface
              const state = useGameStore.getState();
              if (!state.permanentPositions[permanentId]) {
                state.setPermanentPosition(permanentId, {
                  permanentId,
                  state: "surface",
                  position: {
                    x: 0, // Default position - will be updated by actual game logic
                    y: 0,
                    z: 0,
                  },
                });
              }
            }

            const actions = getAvailableActions(permanentId);
            console.log("Debug - Fallback - Permanent ID:", permanentId);
            console.log("Debug - Fallback - Available actions:", actions);
            console.log("Debug - Fallback - Abilities set:", {
              canBurrow,
              canSubmerge,
            });
            setPositionActions(actions);
          }
        })();
      } else {
        setPositionActions([]);
      }
    } else {
      setPositionActions([]);
    }
  }, [contextMenu, permanents, setPermanentAbility, getAvailableActions]);

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
  let doToggleCounter: (() => void) | null = null;
  let hasCounter = false;
  let attachedTokens: Array<{
    name: string;
    index: number;
    type: string | null;
    subTypes: string | null;
    tileKey: string;
  }> = [];
  let isCarryableArtifact = false;
  let isMine = false; // Ownership check for attached items operations

  if (t.kind === "site") {
    const key = toCellKey(t.x, t.y);
    const site = board.sites[key];
    header =
      site?.card?.name || `Site #${getCellNumber(t.x, t.y, board.size.w)}`;
    tapped = !!site?.tapped;
    // Sites do not tap in Sorcery: never show a toggle for sites
    hasToggle = false;
    doToggle = null;

    const ownerKey = site ? seatFromOwner(site.owner) : null;
    const isMine = !actorKey || (ownerKey && actorKey === ownerKey);

    if (site && isMine) {
      transferTo = opponentOwner(site.owner);
      doTransfer = () => {
        transferSiteControl(t.x, t.y);
        onClose();
      };
    }

    if (isMine) {
      doToHand = () => {
        moveSiteToZone(t.x, t.y, "hand");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
      doToGY = () => {
        moveSiteToZone(t.x, t.y, "graveyard");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
      doBanish = () => {
        moveSiteToZone(t.x, t.y, "banished");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
    }

    if (
      isMine &&
      site?.card?.name &&
      (site.card?.type || "").toLowerCase().includes("site")
    ) {
      doAddToAtlas = () => {
        const cardName = site.card?.name || "Card";
        openPlacementDialog(cardName, "Atlas", (position) => {
          moveSiteToZone(t.x, t.y, "atlas", position);
          try {
            playCardFlip();
          } catch {}
        });
        onClose();
      };
    }
  } else if (t.kind === "permanent") {
    const arr = permanents[t.at] || [];
    const item = arr[t.index];
    header = item?.card?.name || "Permanent";
    tapped = !!item?.tapped;
    const ownerKey = item ? seatFromOwner(item.owner) : null;
    const canToggle = !actorKey || (ownerKey && actorKey === ownerKey);
    hasToggle = !!canToggle;
    if (canToggle) {
      doToggle = () => {
        toggleTapPermanent(t.at, t.index);
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
    }

    isMine = !actorKey || !!(ownerKey && actorKey === ownerKey);
    if (item && isMine) {
      transferTo = opponentOwner(item.owner);
      doTransfer = () => {
        transferPermanentControl(t.at, t.index);
        onClose();
      };
    }

    const isToken = (item?.card?.type || "").toLowerCase().includes("token");

    // Check if this is a carryable artifact
    // Carryable artifacts: type = "Artifact" and subTypes != "Monument" or "Automaton"
    const cardType = (item?.card?.type || "").toLowerCase();
    const cardSubTypes = (item?.card?.subTypes || "").toLowerCase();
    const isArtifact = cardType.includes("artifact");
    const isMonument = cardSubTypes.includes("monument");
    const isAutomaton = cardSubTypes.includes("automaton");
    const isCarryableArtifactType = isArtifact && !isMonument && !isAutomaton;
    isCarryableArtifact = isCarryableArtifactType && !item?.attachedTo;

    // Counter toggle for non-site tokens and regular permanents
    if (item) {
      hasCounter = Number(item.counters || 0) > 0;
      doToggleCounter = () => {
        if (hasCounter) {
          clearPermanentCounter(t.at, t.index);
        } else {
          addCounterOnPermanent(t.at, t.index);
        }
        onClose();
      };
    }

    // Check for attached tokens on this permanent (only if it's not a token itself)
    if (!isToken) {
      attachedTokens = arr
        .map((perm, idx) => ({ perm, idx }))
        .filter(
          ({ perm }) =>
            perm.attachedTo &&
            perm.attachedTo.at === t.at &&
            perm.attachedTo.index === t.index
        )
        .map(({ perm, idx }) => ({
          name: perm.card.name,
          index: idx,
          type: perm.card.type || null,
          subTypes: perm.card.subTypes || null,
          tileKey: t.at,
        }));
    }

    if (isToken && isMine) {
      const nonTokenIndices = arr
        .map((it, i) => ({ it, i }))
        .filter(
          ({ it }) => !(it.card.type || "").toLowerCase().includes("token")
        );
      const tokenName = (item?.card?.name || "").toLowerCase();
      const isAttachableToken =
        tokenName === "lance" ||
        tokenName === "stealth" ||
        tokenName === "disabled";

      if (item?.attachedTo) {
        doDetachToken = () => {
          detachToken(t.at, t.index);
          onClose();
        };
      } else if (nonTokenIndices.length > 0 && isAttachableToken) {
        // Allow re-attachment for attachable tokens
        doAttachToken = () => {
          attachTokenToTopPermanent(t.at, t.index);
          onClose();
        };
      }
      doBanish = () => {
        movePermanentToZone(t.at, t.index, "banished");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
    } else if (isMine) {
      // Handle carryable artifacts (attach only - detach is on the unit's menu)
      if (isCarryableArtifactType && !item?.attachedTo) {
        // Artifact is not attached - provide attach option
        // Check for minions (non-artifact permanents) on the same tile
        const nonArtifactPermanents = arr
          .map((it, i) => ({ it, i }))
          .filter(({ it, i }) => {
            const type = (it.card.type || "").toLowerCase();
            const isUnit =
              !type.includes("artifact") &&
              !type.includes("token") &&
              !type.includes("site");
            return isUnit && i !== t.index; // Exclude the artifact itself
          });

        // Check if there's an avatar on this tile
        const ownerKey = seatFromOwner(item.owner);
        const avatar = avatars[ownerKey];
        const avatarPos =
          Array.isArray(avatar?.pos) && avatar.pos.length === 2
            ? avatar.pos
            : null;
        const [artifactX, artifactY] = t.at.split(",").map(Number);
        const isOnAvatarTile =
          avatarPos && avatarPos[0] === artifactX && avatarPos[1] === artifactY;

        // Can attach to minion or avatar
        const hasAttachableTarget =
          nonArtifactPermanents.length > 0 || isOnAvatarTile;

        if (hasAttachableTarget) {
          doAttachToken = () => {
            if (nonArtifactPermanents.length > 0) {
              // Attach to the top-most minion on the same tile
              const targetIdx =
                nonArtifactPermanents[nonArtifactPermanents.length - 1].i;
              attachTokenToPermanent(t.at, t.index, targetIdx);
              log(`Attached artifact '${item.card.name}' to minion`);
            } else if (isOnAvatarTile) {
              // Attach to avatar using the new function
              attachPermanentToAvatar(t.at, t.index, ownerKey);
            }
            onClose();
          };
        }
      }

      doToHand = () => {
        movePermanentToZone(t.at, t.index, "hand");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
      doToGY = () => {
        movePermanentToZone(t.at, t.index, "graveyard");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
      if (item?.card?.name) {
        doToSpellbook = () => {
          const cardName = item.card?.name || "Card";
          openPlacementDialog(cardName, "Spellbook", (position) => {
            movePermanentToZone(t.at, t.index, "spellbook", position);
            try {
              playCardFlip();
            } catch {}
          });
          onClose();
        };
      }
      doBanish = () => {
        movePermanentToZone(t.at, t.index, "banished");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
    }

    // Combat actions (same-tile and ranged-adjacent)
    try {
      const canAct =
        isMine &&
        ((actorKey === "p1" && currentPlayer === 1) ||
          (actorKey === "p2" && currentPlayer === 2) ||
          !actorKey);
      const ownerNum: 1 | 2 | null = item ? item.owner : null;
      const enemyOwner: 1 | 2 | null =
        ownerNum != null ? opponentOwner(ownerNum) : null;
      const { x, y } = parseCellKey(t.at as string);
      const tileKey = t.at;
      const unitsHere =
        enemyOwner != null
          ? (permanents[tileKey] || []).some((p) => p && p.owner === enemyOwner)
          : false;
      const siteHereEnemy =
        enemyOwner != null ? board.sites[tileKey]?.owner === enemyOwner : false;
      const canAttackHere = canAct && !tapped && (unitsHere || siteHereEnemy);
      const isRanged = !!(
        item?.card?.name && detectRangedAbilitySync(item.card.name)
      );
      const boardW = board.size.w,
        boardH = board.size.h;
      const neighbors: Array<{ x: number; y: number }> = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < boardW && p.y < boardH);
      const rangedTargets =
        isRanged && enemyOwner != null && canAct && !tapped
          ? neighbors.filter((p) => {
              const k = toCellKey(p.x, p.y);
              const list = permanents[k] || [];
              return list.some((u) => u && u.owner === enemyOwner);
            })
          : [];

      if (canAttackHere && item) {
        // Insert button to render later
        extraActions.push({
          actionId: "__attack_here__",
          displayText:
            siteHereEnemy && !unitsHere ? "Attack site here" : "Attack here",
          isEnabled: true,
          targetPermanentId: 0,
          description: "Start an attack on this tile",
        });
      }

      if (rangedTargets.length > 0 && item) {
        for (const p of rangedTargets) {
          const cellNo = getCellNumber(p.x, p.y, board.size.w);
          extraActions.push({
            actionId: `__attack_adj_${p.x}_${p.y}__`,
            displayText: `Ranged attack T${cellNo}`,
            isEnabled: true,
            targetPermanentId: 0,
            description: "Start a ranged attack to an adjacent tile",
          });
        }
      }
    } catch {}
  } else if (t.kind === "avatar") {
    const a = avatars[t.who];
    header = a?.card?.name || `${t.who.toUpperCase()} Avatar`;
    tapped = !!a?.tapped;
    const canToggle = !actorKey || actorKey === t.who;
    hasToggle = !!canToggle;
    isMine = !actorKey || actorKey === t.who;
    if (canToggle) {
      doToggle = () => {
        toggleTapAvatar(t.who);
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
    }

    // Avatar counter toggle (same UX as permanents)
    if (a) {
      hasCounter = Number(a.counters || 0) > 0;
      doToggleCounter = () => {
        if (hasCounter) {
          clearAvatarCounter(t.who);
        } else {
          addCounterOnAvatar(t.who);
        }
        onClose();
      };
    }

    // Find artifacts attached to this avatar (attachedTo.index === -1)
    const avatarPos =
      Array.isArray(a?.pos) && a.pos.length === 2 ? a.pos : null;
    if (avatarPos) {
      const [ax, ay] = avatarPos;
      const avatarTileKey = toCellKey(ax, ay);
      const tilePermanents = permanents[avatarTileKey] || [];
      attachedTokens = tilePermanents
        .map((perm, idx) => ({ perm, idx }))
        .filter(
          ({ perm }) =>
            perm.attachedTo &&
            perm.attachedTo.at === avatarTileKey &&
            perm.attachedTo.index === -1
        )
        .map(({ perm, idx }) => ({
          name: perm.card.name,
          index: idx,
          type: perm.card.type || null,
          subTypes: perm.card.subTypes || null,
          tileKey: avatarTileKey,
        }));
    }
  } else if (t.kind === "pile") {
    const pile: CardRef[] = zones[t.who][t.from];
    const count = pile.length;
    const name =
      t.from === "spellbook"
        ? "Spellbook"
        : t.from === "atlas"
        ? "Atlas"
        : t.from === "graveyard"
        ? "Cemetery"
        : "Collection";
    header = `${name} (${count} cards)`;
    const isMine = !actorKey || actorKey === t.who;
    const isCurrent = (t.who === "p1" ? 1 : 2) === currentPlayer;
    if (isMine && isCurrent && count > 0) {
      doDrawFromPile = () => {
        const top = pile[0];
        if (!top) return;
        setDragFromPile({ who: t.who, from: t.from, card: top });
        drawFromPileToHand();
        try {
          playCardSelect();
        } catch {}
        onClose();
      };
    }
    // Only Spellbook/Atlas can be shuffled; Collection and Cemetery are not shuffled
    if (isMine && isCurrent && (t.from === "spellbook" || t.from === "atlas")) {
      doShufflePile = () => {
        if (t.from === "spellbook") shuffleSpellbook(t.who);
        else shuffleAtlas(t.who);
        try {
          playCardShuffle();
        } catch {}
        onClose();
      };
    }
    const canSearch = t.from === "graveyard" ? count > 0 : isMine && count > 0;
    if (canSearch) {
      doSearchPile = () => {
        const displayName =
          t.from === "spellbook"
            ? "Spellbook"
            : t.from === "atlas"
            ? "Atlas"
            : t.from === "graveyard"
            ? "Cemetery"
            : "Collection";
        if (t.from === "graveyard") {
          // Graveyard search is read-only for both players
          openSearchDialog(displayName, pile, (selectedCard) => {
            if (!isMine) return;
            setDragFromPile({ who: t.who, from: t.from, card: selectedCard });
            drawFromPileToHand();
          });
        } else {
          openSearchDialog(displayName, pile, (selectedCard) => {
            // Draw the selected card to hand (only own piles)
            if (!isMine) return;
            setDragFromPile({ who: t.who, from: t.from, card: selectedCard });
            drawFromPileToHand();
          });
        }
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
      const tokenCards = (TOKEN_DEFS || []).map(
        (def: { name: string; key: string; size?: string }) => ({
          cardId: -1,
          variantId: null,
          name: def.name,
          type: "Token",
          slug: tokenSlug(def),
          thresholds: null,
        })
      ) as CardRef[];
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
                    {t.kind === "permanent" && isCarryableArtifact
                      ? "Attach to unit"
                      : "Attach to permanent"}
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
            {/* Attached tokens section - show for permanents and avatars */}
            {attachedTokens &&
              attachedTokens.length > 0 &&
              (t.kind === "permanent" || t.kind === "avatar") && (
                <div className="space-y-2">
                  <div className="text-xs text-white/70 px-3 py-1">
                    Attached Items:
                  </div>
                  {attachedTokens.map((token) => {
                    const tokenName = token.name.toLowerCase();
                    const isLance = tokenName === "lance";
                    const isStealth = tokenName === "stealth";
                    const isDisabled = tokenName === "disabled";

                    // Check if this is a carryable artifact
                    const tokenType = (token.type || "").toLowerCase();
                    const tokenSubTypes = (token.subTypes || "").toLowerCase();
                    const isArtifact = tokenType.includes("artifact");
                    const isMonument = tokenSubTypes.includes("monument");
                    const isAutomaton = tokenSubTypes.includes("automaton");
                    const isCarryableArt =
                      isArtifact && !isMonument && !isAutomaton;

                    if (isCarryableArt) {
                      // Carryable artifacts: offer Drop option (like Lance) - only if we own the parent
                      if (!isMine) {
                        return (
                          <div
                            key={token.index}
                            className="w-full text-left text-xs text-white/50 px-3 py-1"
                          >
                            {token.name} (opponent&apos;s)
                          </div>
                        );
                      }
                      return (
                        <button
                          key={token.index}
                          className="w-full text-left rounded bg-purple-900/20 hover:bg-purple-900/40 px-3 py-1 text-sm"
                          onClick={() => {
                            detachToken(token.tileKey, token.index);
                            onClose();
                          }}
                        >
                          Drop {token.name}
                        </button>
                      );
                    } else if (isLance) {
                      // Lance: offer Drop or Destroy options - only if we own the parent
                      if (!isMine) {
                        return (
                          <div
                            key={token.index}
                            className="w-full text-left text-xs text-white/50 px-3 py-1"
                          >
                            {token.name} (opponent&apos;s)
                          </div>
                        );
                      }
                      return (
                        <div key={token.index} className="space-y-1">
                          <button
                            className="w-full text-left rounded bg-amber-900/20 hover:bg-amber-900/40 px-3 py-1 text-sm"
                            onClick={() => {
                              detachToken(token.tileKey, token.index);
                              onClose();
                            }}
                          >
                            Drop {token.name}
                          </button>
                          <button
                            className="w-full text-left rounded bg-red-900/20 hover:bg-red-900/40 px-3 py-1 text-sm"
                            onClick={() => {
                              movePermanentToZone(
                                token.tileKey,
                                token.index,
                                "banished"
                              );
                              try {
                                playCardFlip();
                              } catch {}
                              onClose();
                            }}
                          >
                            Destroy {token.name}
                          </button>
                        </div>
                      );
                    } else if (isStealth || isDisabled) {
                      // Stealth/Disabled: banish when detached - only if we own the parent
                      if (!isMine) {
                        return (
                          <div
                            key={token.index}
                            className="w-full text-left text-xs text-white/50 px-3 py-1"
                          >
                            {token.name} (opponent&apos;s)
                          </div>
                        );
                      }
                      return (
                        <button
                          key={token.index}
                          className="w-full text-left rounded bg-red-900/20 hover:bg-red-900/40 px-3 py-1 text-sm"
                          onClick={() => {
                            // First detach, then immediately banish
                            detachToken(token.tileKey, token.index);
                            // Use setTimeout to ensure detach completes first
                            setTimeout(() => {
                              const permanents =
                                useGameStore.getState().permanents;
                              const items = permanents[token.tileKey] || [];
                              // Find the token that was just detached
                              const detachedToken = items.find(
                                (item) =>
                                  !item.attachedTo &&
                                  item.card.name.toLowerCase() === tokenName
                              );
                              if (detachedToken) {
                                const tokenIndex = items.indexOf(detachedToken);
                                if (tokenIndex >= 0) {
                                  movePermanentToZone(
                                    token.tileKey,
                                    tokenIndex,
                                    "banished"
                                  );
                                  try {
                                    playCardFlip();
                                  } catch {}
                                }
                              }
                            }, 50);
                            onClose();
                          }}
                        >
                          Remove {token.name}
                        </button>
                      );
                    } else {
                      // Other tokens: simple detach - only if we own the parent
                      if (!isMine) {
                        return (
                          <div
                            key={token.index}
                            className="w-full text-left text-xs text-white/50 px-3 py-1"
                          >
                            {token.name} (opponent&apos;s)
                          </div>
                        );
                      }
                      return (
                        <button
                          key={token.index}
                          className="w-full text-left rounded bg-red-900/20 hover:bg-red-900/40 px-3 py-1 text-sm"
                          onClick={() => {
                            detachToken(token.tileKey, token.index);
                            onClose();
                          }}
                        >
                          Detach {token.name}
                        </button>
                      );
                    }
                  })}
                </div>
              )}

            {/* Counter toggle */}
            {doToggleCounter && (
              <button
                className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                onClick={doToggleCounter}
              >
                {hasCounter ? "Remove counter" : "Add counter"}
              </button>
            )}

            {/* Burrow/Submerge Actions */}
            {(positionActions.length > 0 ||
              (Array.isArray(extraActions) && extraActions.length > 0)) && (
              <div className="space-y-2">
                {positionActions.concat(extraActions).map((action) => {
                  const isAttackHere = action.actionId === "__attack_here__";
                  const isAttackAdj =
                    action.actionId.startsWith("__attack_adj_");
                  if (isAttackHere) {
                    return (
                      <button
                        key={action.actionId}
                        className="w-full text-left rounded bg-emerald-600/20 hover:bg-emerald-600/30 px-3 py-1"
                        onClick={() => {
                          // Reconstruct context to call attack here
                          if (t.kind === "permanent") {
                            const [sx, sy] = t.at.split(",");
                            const at = t.at as string;
                            const idx = t.index as number;
                            const px = Number(sx),
                              py = Number(sy);
                            const itm = (permanents[at] || [])[idx];
                            if (itm) {
                              setAttackTargetChoice({
                                tile: { x: px, y: py },
                                attacker: {
                                  at,
                                  index: idx,
                                  instanceId: itm.instanceId ?? null,
                                  owner: itm.owner as 1 | 2,
                                },
                                candidates: [],
                              });
                            }
                          }
                          onClose();
                        }}
                      >
                        {action.displayText}
                      </button>
                    );
                  }
                  if (isAttackAdj) {
                    return (
                      <button
                        key={action.actionId}
                        className="w-full text-left rounded bg-emerald-600/20 hover:bg-emerald-600/30 px-3 py-1"
                        onClick={() => {
                          const prefix = "__attack_adj_";
                          const rest = action.actionId.startsWith(prefix)
                            ? action.actionId.slice(prefix.length)
                            : "";
                          const coordsStr = rest.endsWith("__")
                            ? rest.slice(0, -2)
                            : rest;
                          const parts = coordsStr.split("_");
                          const ax = Number(parts[0]);
                          const ay = Number(parts[1]);
                          if (t.kind === "permanent") {
                            const at = t.at as string;
                            const idx = t.index as number;
                            const itm = (permanents[at] || [])[idx];
                            if (
                              itm &&
                              Number.isFinite(ax) &&
                              Number.isFinite(ay)
                            ) {
                              setAttackTargetChoice({
                                tile: { x: ax, y: ay },
                                attacker: {
                                  at,
                                  index: idx,
                                  instanceId: itm.instanceId ?? null,
                                  owner: itm.owner as 1 | 2,
                                },
                                candidates: [],
                              });
                            }
                          }
                          onClose();
                        }}
                      >
                        {action.displayText}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={action.actionId}
                      className={`w-full text-left rounded px-3 py-1 flex items-center space-x-2 ${
                        action.isEnabled
                          ? "bg-blue-600/20 hover:bg-blue-600/30 text-blue-200"
                          : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                      }`}
                      disabled={!action.isEnabled}
                      onClick={() => {
                        if (action.isEnabled && action.newPositionState) {
                          updatePermanentState(
                            action.targetPermanentId,
                            action.newPositionState
                          );
                          log(
                            `${header} ${action.displayText.toLowerCase()}${
                              action.newPositionState === "surface"
                                ? "ed"
                                : "ed"
                            }`
                          );
                          onClose();
                        }
                      }}
                      title={action.description}
                    >
                      <span className="text-xs">
                        {action.icon === "arrow-down" && "↓"}
                        {action.icon === "arrow-up" && "↑"}
                        {action.icon === "waves" && "〜"}
                      </span>
                      <span>{action.displayText}</span>
                    </button>
                  );
                })}
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
