"use client";

import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  isNecromancer,
  isDruid,
  hasTapToDrawSite,
  isMephistopheles,
  isPathfinder,
} from "@/lib/game/avatarAbilities";
import {
  detectBurrowSubmergeAbilities,
  detectBurrowSubmergeAbilitiesSync,
  detectRangedAbilitySync,
  detectStealthAbility,
  detectStealthAbilitySync,
  detectWardAbility,
  detectWardAbilitySync,
} from "@/lib/game/cardAbilities";
import AttachmentTargetSelectionDialog, {
  type AttachmentTarget,
} from "@/lib/game/components/AttachmentTargetSelectionDialog";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";
import { isMasked } from "@/lib/game/store/imposterMaskState";
import {
  isMonumentByName,
  isAutomatonByName,
} from "@/lib/game/store/omphalosState";
import { NECROMANCER_SKELETON_COST } from "@/lib/game/store/types";
import {
  getCellNumber,
  parseCellKey,
  seatFromOwner,
  toCellKey,
  opponentOwner,
} from "@/lib/game/store/utils/boardHelpers";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
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
  const toggleFaceDown = useGameStore((s) => s.toggleFaceDown);
  const setAttackTargetChoice = useGameStore((s) => s.setAttackTargetChoice);
  const addCounterOnPermanent = useGameStore((s) => s.addCounterOnPermanent);
  const clearPermanentCounter = useGameStore((s) => s.clearPermanentCounter);
  const addCounterOnAvatar = useGameStore((s) => s.addCounterOnAvatar);
  const clearAvatarCounter = useGameStore((s) => s.clearAvatarCounter);
  const toggleTapAvatar = useGameStore((s) => s.toggleTapAvatar);
  const moveSiteToZone = useGameStore((s) => s.moveSiteToZone);
  const moveSiteToGraveyardWithRubble = useGameStore(
    (s) => s.moveSiteToGraveyardWithRubble
  );
  const floodSite = useGameStore((s) => s.floodSite);
  const silenceSite = useGameStore((s) => s.silenceSite);
  const movePermanentToZone = useGameStore((s) => s.movePermanentToZone);
  const transferSiteControl = useGameStore((s) => s.transferSiteControl);
  const transferPermanentControl = useGameStore(
    (s) => s.transferPermanentControl
  );
  const copyPermanent = useGameStore((s) => s.copyPermanent);
  const drawFromPileToHand = useGameStore((s) => s.drawFromPileToHand);
  const moveFromGraveyardToBanished = useGameStore(
    (s) => s.moveFromGraveyardToBanished
  );
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const shuffleSpellbook = useGameStore((s) => s.shuffleSpellbook);
  const shuffleAtlas = useGameStore((s) => s.shuffleAtlas);
  const drawFromBottom = useGameStore((s) => s.drawFromBottom);
  const openSearchDialog = useGameStore((s) => s.openSearchDialog);
  const openPlacementDialog = useGameStore((s) => s.openPlacementDialog);
  const addTokenToHand = useGameStore((s) => s.addTokenToHand);
  const attachTokenToPermanent = useGameStore((s) => s.attachTokenToPermanent);
  const attachPermanentToAvatar = useGameStore(
    (s) => s.attachPermanentToAvatar
  );
  const detachToken = useGameStore((s) => s.detachToken);
  const log = useGameStore((s) => s.log);
  const setSwitchSiteSource = useGameStore((s) => s.setSwitchSiteSource);
  const sendInteractionRequest = useGameStore((s) => s.sendInteractionRequest);
  const transport = useGameStore((s) => s.transport);
  const matchId = useGameStore((s) => s.matchId);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const opponentPlayerId = useGameStore((s) => s.opponentPlayerId);
  const imposterMasks = useGameStore((s) => s.imposterMasks);
  const unmask = useGameStore((s) => s.unmask);
  const necromancerSkeletonUsed = useGameStore(
    (s) => s.necromancerSkeletonUsed
  );
  const summonSkeletonHere = useGameStore((s) => s.summonSkeletonHere);
  const mephistophelesSummonUsed = useGameStore(
    (s) => s.mephistophelesSummonUsed
  );
  const beginMephistophelesSummon = useGameStore(
    (s) => s.beginMephistophelesSummon
  );
  const pathfinderUsed = useGameStore((s) => s.pathfinderUsed);
  const beginPathfinderPlay = useGameStore((s) => s.beginPathfinderPlay);
  const druidFlipped = useGameStore((s) => s.druidFlipped);
  const flipDruid = useGameStore((s) => s.flipDruid);
  const getAvailableMana = useGameStore((s) => s.getAvailableMana);
  const triggerFrontierSettlersAbility = useGameStore(
    (s) => s.triggerFrontierSettlersAbility
  );
  const _hasFrontierSettlersAbility = useGameStore(
    (s) => s.hasFrontierSettlersAbility
  );

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
  // Track if current permanent/site has stealth/ward keyword ability
  const [hasStealthAbility, setHasStealthAbility] = useState(false);
  const [hasWardAbility, setHasWardAbility] = useState(false);
  const [siteHasWardAbility, setSiteHasWardAbility] = useState(false);
  // Extra combat actions computed per-open menu (do not store in state to avoid duplication)
  const extraActions: ContextMenuAction[] = [];

  // Attachment target selection dialog state
  const [attachmentDialog, setAttachmentDialog] = useState<{
    artifactName: string;
    artifactAt: string;
    artifactIndex: number;
    targets: AttachmentTarget[];
  } | null>(null);

  // Rubble confirmation dialog state (when sending site to cemetery)
  const [rubbleDialog, setRubbleDialog] = useState<{
    siteX: number;
    siteY: number;
    siteName: string;
    siteOwner: 1 | 2;
  } | null>(null);

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
      setHasStealthAbility(false);
      setHasWardAbility(false);
      setSiteHasWardAbility(false);
      return;
    }

    // Detect ward ability for sites
    const t = contextMenu.target;
    if (t.kind === "site") {
      const key = toCellKey(t.x, t.y);
      const site = board.sites[key];
      if (site?.card?.name) {
        const cardName = site.card.name;
        (async () => {
          const hasWard = await detectWardAbility(cardName);
          setSiteHasWardAbility(hasWard);
        })();
      } else {
        setSiteHasWardAbility(false);
      }
    } else {
      setSiteHasWardAbility(false);
    }

    if (t.kind === "permanent") {
      const item = permanents[t.at]?.[t.index];
      if (item?.card) {
        // Use instanceId for stable identification (prevents state leakage on card movement)
        const permanentId = item.instanceId ?? `perm:${t.at}:${t.index}`;

        // Fetch abilities asynchronously from API
        (async () => {
          try {
            // Detect stealth and ward abilities
            const hasStealth = await detectStealthAbility(item.card.name);
            setHasStealthAbility(hasStealth);
            const hasWard = await detectWardAbility(item.card.name);
            setHasWardAbility(hasWard);

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
            setHasStealthAbility(detectStealthAbilitySync(item.card.name));
            setHasWardAbility(detectWardAbilitySync(item.card.name));
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

  // Handle Rubble confirmation - defined early so it can be used in early return
  const handleRubbleConfirm = (placeRubble: boolean) => {
    if (!rubbleDialog) return;
    const { siteX, siteY } = rubbleDialog;

    // Use atomic action that combines site removal and Rubble placement
    // This ensures both operations are sent in a single patch for proper sync
    moveSiteToGraveyardWithRubble(siteX, siteY, placeRubble);
    try {
      playCardFlip();
    } catch {}

    setRubbleDialog(null);
    onClose();
  };

  const handleRubbleCancel = () => {
    setRubbleDialog(null);
    // Don't close context menu - let user choose another action
  };

  // Keep component mounted if rubble dialog is open, even if contextMenu is closed
  if (!contextMenu && !rubbleDialog) return null;

  // If only rubble dialog is open (contextMenu closed), just render the dialog
  if (!contextMenu && rubbleDialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div
          className="bg-zinc-900 rounded-xl ring-1 ring-white/20 shadow-2xl p-5 w-80 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-lg font-semibold mb-3">Replace with Rubble?</div>
          <div className="text-sm text-white/80 mb-4">
            <span className="font-medium">{rubbleDialog.siteName}</span> is
            being sent to the cemetery. Would you like to place a Rubble token
            at this location under{" "}
            <span className="font-medium">
              P{rubbleDialog.siteOwner}&apos;s
            </span>{" "}
            control?
          </div>
          <div className="flex gap-3">
            <button
              className="flex-1 rounded bg-amber-600 hover:bg-amber-500 px-4 py-2 font-medium"
              onClick={() => handleRubbleConfirm(true)}
            >
              Yes, place Rubble
            </button>
            <button
              className="flex-1 rounded bg-zinc-700 hover:bg-zinc-600 px-4 py-2"
              onClick={() => handleRubbleConfirm(false)}
            >
              No Rubble
            </button>
          </div>
          <button
            className="w-full mt-2 text-sm text-white/60 hover:text-white/80 py-1"
            onClick={handleRubbleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!contextMenu) return null;

  const t = contextMenu.target;
  let header = "";
  let tapped = false;
  let hasToggle = false;
  let doToggle: (() => void) | null = null;
  let doFlip: (() => void) | null = null;
  let isFaceDown = false;
  let doToHand: (() => void) | null = null;
  let doToGY: (() => void) | null = null;
  let doToSpellbook: (() => void) | null = null;
  let doBanish: (() => void) | null = null;
  let doTransfer: (() => void) | null = null;
  let transferTo: 1 | 2 | null = null;
  let doDrawFromPile: (() => void) | null = null;
  let doDrawFromPileBottom: (() => void) | null = null;
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
    card?: CardRef;
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
    // Acting player can send opponent's sites to graveyard/banished
    const isActingPlayer =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2) ||
      !actorKey;

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
    }
    // Acting player can send any site to graveyard/banished (destroy effects)
    if (isMine || isActingPlayer) {
      doToGY = () => {
        // Show Rubble confirmation dialog instead of immediately moving
        if (site) {
          setRubbleDialog({
            siteX: t.x,
            siteY: t.y,
            siteName: site.card?.name || "Site",
            siteOwner: site.owner,
          });
        } else {
          moveSiteToZone(t.x, t.y, "graveyard");
          try {
            playCardFlip();
          } catch {}
          onClose();
        }
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

    // Switch Site Position (Earthquake, Rift Valley)
    // Can move a site to a void or swap with another site
    if (site) {
      extraActions.push({
        actionId: "__switch_site_position__",
        displayText: "Switch Position",
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Click another tile to move this site there (swap or move to void). All minions and avatars move with the site.",
      });
    }

    // Flood - place a Flooded site token on top of this site
    if (site && (isMine || isActingPlayer)) {
      extraActions.push({
        actionId: "__flood_site__",
        displayText: "Flood",
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Place a Flooded token on this site (adds water threshold).",
      });
    }

    // Silence - place a Silenced token on this site (removes site abilities)
    if (site && (isMine || isActingPlayer)) {
      extraActions.push({
        actionId: "__silence_site__",
        displayText: "Silence",
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Place a Silenced token on this site (removes mana and threshold).",
      });
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

    // Flip (face-down/face-up) for permanents owned by the player
    isFaceDown = !!item?.faceDown;
    if (canToggle) {
      doFlip = () => {
        toggleFaceDown(t.at, t.index);
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
    // Use name-based fallback when subTypes might not be populated
    const cardType = (item?.card?.type || "").toLowerCase();
    const cardSubTypes = (item?.card?.subTypes || "").toLowerCase();
    const cardName = item?.card?.name || "";
    const isArtifact = cardType.includes("artifact");
    const isMonument =
      cardSubTypes.includes("monument") || isMonumentByName(cardName);
    const isAutomaton =
      cardSubTypes.includes("automaton") || isAutomatonByName(cardName);
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
    if (!isToken && item) {
      // Standard attachment matching
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
          card: perm.card,
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
        tokenName === "disabled" ||
        tokenName === "ward";

      if (item?.attachedTo) {
        doDetachToken = () => {
          detachToken(t.at, t.index);
          onClose();
        };
      } else if (isAttachableToken) {
        // Check if there's an avatar on this tile (same logic as artifacts)
        const ownerKey = seatFromOwner(item.owner);
        const avatar = avatars[ownerKey];
        const avatarPos =
          Array.isArray(avatar?.pos) && avatar.pos.length === 2
            ? avatar.pos
            : null;
        const [tokenX, tokenY] = t.at.split(",").map(Number);
        const isOnAvatarTile =
          avatarPos && avatarPos[0] === tokenX && avatarPos[1] === tokenY;

        // Build list of all possible attachment targets for tokens
        const possibleTargets: AttachmentTarget[] = nonTokenIndices.map(
          ({ it, i }) => ({
            type: "permanent" as const,
            index: i,
            card: it.card,
            displayName: it.card.name,
          })
        );

        // Add avatar if on same tile
        if (isOnAvatarTile && avatar?.card) {
          possibleTargets.push({
            type: "avatar",
            index: -1,
            card: avatar.card,
            displayName: `${ownerKey.toUpperCase()} Avatar`,
          });
        }

        // Allow attachment if there are any targets
        if (possibleTargets.length > 0) {
          doAttachToken = () => {
            console.log(
              "[ContextMenu] Token attach clicked, targets:",
              possibleTargets.length
            );
            // If only one target, attach directly (old behavior)
            if (possibleTargets.length === 1) {
              const target = possibleTargets[0];
              if (target.type === "avatar") {
                attachPermanentToAvatar(t.at, t.index, ownerKey);
              } else {
                attachTokenToPermanent(t.at, t.index, target.index);
              }
              onClose();
            } else {
              // Multiple targets: show selection dialog (don't close menu yet)
              console.log(
                "[ContextMenu] Opening attachment dialog for token",
                item.card.name
              );
              setAttachmentDialog({
                artifactName: item.card.name,
                artifactAt: t.at,
                artifactIndex: t.index,
                targets: possibleTargets,
              });
              console.log("[ContextMenu] Dialog state set");
            }
          };
        }
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

        // Build list of all possible attachment targets
        const possibleTargets: AttachmentTarget[] = [];

        // Add all minions as potential targets
        for (const { it, i } of nonArtifactPermanents) {
          possibleTargets.push({
            type: "permanent",
            index: i,
            card: it.card,
            displayName: it.card.name,
          });
        }

        // Add avatar if on same tile
        if (isOnAvatarTile && avatar?.card) {
          possibleTargets.push({
            type: "avatar",
            index: -1,
            card: avatar.card,
            displayName: `${ownerKey.toUpperCase()} Avatar`,
          });
        }

        // Can attach to minion or avatar
        const hasAttachableTarget = possibleTargets.length > 0;

        if (hasAttachableTarget) {
          doAttachToken = () => {
            console.log(
              "[ContextMenu] Artifact attach clicked, targets:",
              possibleTargets.length,
              possibleTargets
            );
            // If only one target, attach directly (old behavior)
            if (possibleTargets.length === 1) {
              const target = possibleTargets[0];
              if (target.type === "avatar") {
                attachPermanentToAvatar(t.at, t.index, ownerKey);
              } else {
                attachTokenToPermanent(t.at, t.index, target.index);
                log(
                  `Attached artifact '${item.card.name}' to ${target.displayName}`
                );
              }
              onClose();
            } else {
              // Multiple targets: show selection dialog (don't close menu yet)
              console.log(
                "[ContextMenu] Opening attachment dialog for artifact",
                item.card.name
              );
              setAttachmentDialog({
                artifactName: item.card.name,
                artifactAt: t.at,
                artifactIndex: t.index,
                targets: possibleTargets,
              });
              console.log(
                "[ContextMenu] Dialog state set, targets:",
                possibleTargets
              );
            }
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
    }

    // Acting player can send any permanent to graveyard/banished (destroy effects)
    const isActingPlayer =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2) ||
      !actorKey;
    if (isMine || isActingPlayer) {
      doToGY = () => {
        movePermanentToZone(t.at, t.index, "graveyard");
        try {
          playCardFlip();
        } catch {}
        onClose();
      };
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
          targetPermanentId: "",
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
            targetPermanentId: "",
            description: "Start a ranged attack to an adjacent tile",
          });
        }
      }

      // Frontier Settlers tap ability - DISABLED: easier to resolve manually by dragging from atlas
      // const isFrontierSettlers =
      //   (item?.card?.name || "").toLowerCase() === "frontier settlers";
      // if (isFrontierSettlers && isMine && item?.instanceId) {
      //   const hasAbility = hasFrontierSettlersAbility(item.instanceId);
      //   const canUse = hasAbility && !tapped;
      //   extraActions.push({
      //     actionId: "__frontier_settlers_ability__",
      //     displayText: `Play Top Site${!hasAbility ? " ✓" : ""}`,
      //     isEnabled: canUse,
      //     targetPermanentId: "",
      //     description: hasAbility
      //       ? "Tap to reveal and play your topmost site to an adjacent void or Rubble"
      //       : "Ability already used",
      //   });
      // }
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

    // Imposter unmask action (if player is masked)
    if (isMine && isMasked(imposterMasks, t.who)) {
      const maskState = imposterMasks[t.who];
      extraActions.push({
        actionId: "__unmask__",
        displayText: `Unmask (was ${maskState?.maskAvatar?.name || "masked"})`,
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Remove mask and reveal original Imposter avatar. The mask is banished.",
      });
    }

    // Necromancer skeleton summon action (once per turn, costs 1 mana)
    // Check if avatar is Necromancer (or masked as Necromancer)
    const avatarName = a?.card?.name;
    const maskedState = imposterMasks[t.who];
    const effectiveAvatarName = maskedState?.maskAvatar?.name ?? avatarName;
    const currentSeat = currentPlayer === 1 ? "p1" : "p2";
    const isMyTurn = t.who === currentSeat;
    const availableMana = getAvailableMana(t.who);
    const hasEnoughMana = availableMana >= NECROMANCER_SKELETON_COST;
    const hasAlreadyUsed = necromancerSkeletonUsed[t.who];
    const hasPosition = Array.isArray(a?.pos) && a.pos.length === 2;

    if (isMine && isNecromancer(effectiveAvatarName)) {
      const canSummon =
        isMyTurn && hasEnoughMana && !hasAlreadyUsed && hasPosition;
      let description = `Summon a Skeleton token at your avatar's location (costs ${NECROMANCER_SKELETON_COST} mana, once per turn)`;
      if (!isMyTurn) description = "Can only summon skeleton on your turn";
      else if (hasAlreadyUsed)
        description = "Already summoned a skeleton this turn";
      else if (!hasEnoughMana)
        description = `Not enough mana (need ${NECROMANCER_SKELETON_COST}, have ${availableMana})`;
      else if (!hasPosition) description = "Avatar must be on the board";

      extraActions.push({
        actionId: "__summon_skeleton__",
        displayText: `Summon Skeleton (${NECROMANCER_SKELETON_COST} mana)${
          hasAlreadyUsed ? " ✓" : ""
        }`,
        isEnabled: canSummon,
        targetPermanentId: "",
        description,
      });
    }

    // Mephistopheles summon Evil minion action (once per turn, no mana cost)
    const mephHasAlreadyUsed = mephistophelesSummonUsed[t.who];
    if (isMine && isMephistopheles(effectiveAvatarName)) {
      const canSummon = isMyTurn && !mephHasAlreadyUsed && hasPosition;
      let mephDescription =
        "Summon an Evil minion from your hand to an adjacent site (once per turn)";
      if (!isMyTurn) mephDescription = "Can only summon on your turn";
      else if (mephHasAlreadyUsed)
        mephDescription = "Already summoned an Evil minion this turn";
      else if (!hasPosition) mephDescription = "Avatar must be on the board";

      extraActions.push({
        actionId: "__mephistopheles_summon__",
        displayText: `Summon Evil Minion${mephHasAlreadyUsed ? " ✓" : ""}`,
        isEnabled: canSummon,
        targetPermanentId: "",
        description: mephDescription,
      });
    }

    // Pathfinder play site action (tap → play top site to adjacent void/Rubble and move)
    const pathfinderHasAlreadyUsed = pathfinderUsed[t.who];
    if (isMine && isPathfinder(effectiveAvatarName)) {
      const isNotTapped = !a?.tapped;
      const atlasCount = zones[t.who]?.atlas?.length ?? 0;
      const canPlay =
        isMyTurn &&
        !pathfinderHasAlreadyUsed &&
        isNotTapped &&
        hasPosition &&
        atlasCount > 0;
      let pathDescription =
        "Tap to play top site from atlas to adjacent void/Rubble and move there";
      if (!isMyTurn) pathDescription = "Can only use on your turn";
      else if (pathfinderHasAlreadyUsed)
        pathDescription = "Already used Pathfinder ability this turn";
      else if (!isNotTapped) pathDescription = "Pathfinder is already tapped";
      else if (!hasPosition) pathDescription = "Avatar must be on the board";
      else if (atlasCount === 0)
        pathDescription = "No sites remaining in atlas";

      extraActions.push({
        actionId: "__pathfinder_play__",
        displayText: `Play Site & Move${pathfinderHasAlreadyUsed ? " ✓" : ""}`,
        isEnabled: canPlay,
        targetPermanentId: "",
        description: pathDescription,
      });
    }

    // Druid flip action (tap → flip, summon Bruin, one-way transformation)
    const hasAlreadyFlipped = druidFlipped[t.who];
    if (isMine && isDruid(effectiveAvatarName)) {
      const isNotTapped = !a?.tapped;
      const canFlip = !hasAlreadyFlipped && isNotTapped && hasPosition;
      let flipDescription =
        "Tap and flip your Druid to summon Bruin here. Cannot flip back.";
      if (hasAlreadyFlipped) flipDescription = "Druid has already been flipped";
      else if (!isNotTapped)
        flipDescription = "Avatar must be untapped to flip";
      else if (!hasPosition) flipDescription = "Avatar must be on the board";

      extraActions.push({
        actionId: "__flip_druid__",
        displayText: `Flip Druid${hasAlreadyFlipped ? " ✓" : ""}`,
        isEnabled: canFlip,
        targetPermanentId: "",
        description: flipDescription,
      });
    }

    // Tap to draw a site action (standard avatar ability)
    // Available for most avatars except Magician (who has no atlas)
    if (isMine && hasTapToDrawSite(effectiveAvatarName)) {
      const atlasCount = zones[t.who]?.atlas?.length ?? 0;
      const canDraw = atlasCount > 0;
      const drawDescription =
        atlasCount > 0 ? "Draw the top site from your Atlas" : "Atlas is empty";

      extraActions.push({
        actionId: "__tap_draw_site__",
        displayText: "Draw Site",
        isEnabled: canDraw,
        targetPermanentId: "",
        description: drawDescription,
      });
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
          card: perm.card,
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
    // Collection and Cemetery don't support "Draw top" - only search
    if (
      isMine &&
      isCurrent &&
      count > 0 &&
      t.from !== "collection" &&
      t.from !== "graveyard"
    ) {
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
      doDrawFromPileBottom = () => {
        drawFromBottom(t.who, t.from as "spellbook" | "atlas");
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
          // Cemetery search with draw and banish options
          // Own cemetery: can draw and banish freely
          // Opponent cemetery: requires consent for draw, banish is allowed
          const isOpponentGraveyard = !isMine;
          const isOnline = !!transport && !!actorKey;
          openSearchDialog(
            displayName,
            pile,
            (selectedCard) => {
              // Draw to hand
              if (!isMine) {
                // Request consent to draw from opponent's cemetery
                if (isOnline && localPlayerId && opponentPlayerId && matchId) {
                  sendInteractionRequest({
                    from: localPlayerId,
                    to: opponentPlayerId,
                    kind: "graveyardAction",
                    matchId,
                    note: `Request to draw ${selectedCard.name} from your cemetery`,
                    payload: {
                      action: "drawToHand",
                      seat: t.who,
                      cardName: selectedCard.name,
                      instanceId: selectedCard.instanceId,
                    },
                  });
                  log(
                    `Requested consent to draw ${selectedCard.name} from opponent's cemetery`
                  );
                  return;
                }
                log("Cannot draw from opponent's cemetery to your hand");
                return;
              }
              setDragFromPile({ who: t.who, from: t.from, card: selectedCard });
              drawFromPileToHand();
            },
            {
              onBanishCard: (selectedCard) => {
                if (!selectedCard.instanceId) return;
                // Banishing from either cemetery is allowed
                moveFromGraveyardToBanished(t.who, selectedCard.instanceId);
              },
              // Show warning indicator on opponent's cemetery banish button
              banishRequiresConsent: isOpponentGraveyard,
            }
          );
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

  // Handle attachment target selection
  const handleAttachmentTargetSelect = (target: AttachmentTarget) => {
    if (!attachmentDialog) return;

    const { artifactAt, artifactIndex } = attachmentDialog;
    const arr = permanents[artifactAt] || [];
    const artifact = arr[artifactIndex];
    if (!artifact) return;

    if (target.type === "avatar") {
      // Attach to avatar
      const ownerKey = seatFromOwner(artifact.owner);
      attachPermanentToAvatar(artifactAt, artifactIndex, ownerKey);
    } else {
      // Attach to permanent
      attachTokenToPermanent(artifactAt, artifactIndex, target.index);
      log(`Attached '${artifact.card.name}' to ${target.displayName}`);
    }

    setAttachmentDialog(null);
    onClose(); // Close context menu after selection
  };

  const handleAttachmentCancel = () => {
    setAttachmentDialog(null);
    onClose(); // Close context menu on cancel
  };

  console.log(
    "[ContextMenu] Rendering, attachmentDialog:",
    attachmentDialog ? "SET" : "null"
  );

  return (
    <>
      {attachmentDialog && (
        <AttachmentTargetSelectionDialog
          artifactName={attachmentDialog.artifactName}
          targets={attachmentDialog.targets}
          onSelect={handleAttachmentTargetSelect}
          onCancel={handleAttachmentCancel}
        />
      )}
      {rubbleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="bg-zinc-900 rounded-xl ring-1 ring-white/20 shadow-2xl p-5 w-80 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold mb-3">
              Replace with Rubble?
            </div>
            <div className="text-sm text-white/80 mb-4">
              <span className="font-medium">{rubbleDialog.siteName}</span> is
              being sent to the cemetery. Would you like to place a Rubble token
              at this location under{" "}
              <span className="font-medium">
                P{rubbleDialog.siteOwner}&apos;s
              </span>{" "}
              control?
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded bg-amber-600 hover:bg-amber-500 px-4 py-2 font-medium"
                onClick={() => handleRubbleConfirm(true)}
              >
                Yes, place Rubble
              </button>
              <button
                className="flex-1 rounded bg-zinc-700 hover:bg-zinc-600 px-4 py-2"
                onClick={() => handleRubbleConfirm(false)}
              >
                No Rubble
              </button>
            </div>
            <button
              className="w-full mt-2 text-sm text-white/60 hover:text-white/80 py-1"
              onClick={handleRubbleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div
        className="absolute inset-0 z-30"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ display: attachmentDialog || rubbleDialog ? "none" : "block" }}
      >
        <div
          ref={menuRef}
          className="absolute bg-zinc-900/90 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg p-3 w-56 text-white pointer-events-auto"
          style={{
            left: (menuPos?.left ?? contextMenu?.screen?.x ?? 16) + "px",
            top: (menuPos?.top ?? contextMenu?.screen?.y ?? 16) + "px",
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

              {doFlip && (
                <button
                  className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                  onClick={doFlip}
                >
                  {isFaceDown ? "Flip face-up" : "Flip face-down"}
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

              {/* Copy permanent - creates a token copy that goes to banished when leaving */}
              {t.kind === "permanent" && isMine && (
                <button
                  className="w-full text-left rounded bg-cyan-900/30 hover:bg-cyan-900/50 px-3 py-1"
                  onClick={() => {
                    copyPermanent(t.at, t.index);
                    try {
                      playCardFlip();
                    } catch {}
                    onClose();
                  }}
                >
                  Copy (token)
                </button>
              )}

              {/* Ward - for sites with ward keyword */}
              {t.kind === "site" && siteHasWardAbility && (
                <button
                  className="w-full text-left rounded bg-cyan-900/30 hover:bg-cyan-900/50 px-3 py-1"
                  onClick={() => {
                    // Spawn ward token and attach to this site
                    const wardDef = TOKEN_BY_NAME["ward"];
                    if (!wardDef) {
                      log("Ward token definition not found");
                      onClose();
                      return;
                    }

                    const key = toCellKey(t.x, t.y);
                    const site = board.sites[key];
                    if (!site) {
                      onClose();
                      return;
                    }

                    const ownerNum = site.owner;
                    const ownerKey = seatFromOwner(ownerNum);
                    const instanceId = `ward-${Date.now()}-${Math.random()
                      .toString(36)
                      .slice(2, 8)}`;

                    // Create ward token card
                    const wardCard = {
                      cardId: newTokenInstanceId(wardDef),
                      variantId: null,
                      name: wardDef.name,
                      type: "Token",
                      slug: tokenSlug(wardDef),
                      thresholds: null,
                      instanceId,
                    };

                    // Create the permanent item for the token on the site's tile
                    const wardPermanent = {
                      owner: ownerNum,
                      card: wardCard,
                      offset: null,
                      tilt: 0,
                      tapVersion: 0,
                      tapped: false,
                      version: 0,
                      instanceId,
                    };

                    // Add to permanents at the site's cell
                    const permanentsNext = { ...permanents };
                    const tileArr = [...(permanentsNext[key] || [])];
                    tileArr.push(wardPermanent);
                    permanentsNext[key] = tileArr;

                    // Update store
                    useGameStore.setState({ permanents: permanentsNext });

                    // Send patch to server
                    const state = useGameStore.getState();
                    if (state.transport) {
                      state.trySendPatch({ permanents: permanentsNext });
                    }

                    const playerNum = ownerKey === "p1" ? "1" : "2";
                    log(
                      `[p${playerNum}card:${
                        site.card?.name || "Site"
                      }] gains Ward`
                    );

                    try {
                      playCardFlip();
                    } catch {}
                    onClose();
                  }}
                >
                  Ward
                </button>
              )}

              {/* Stealth - for permanents with stealth keyword */}
              {t.kind === "permanent" &&
                isMine &&
                hasStealthAbility &&
                (() => {
                  // Check if already has stealth token attached
                  const alreadyHasStealth = attachedTokens?.some(
                    (tk) => tk.name.toLowerCase() === "stealth"
                  );
                  return !alreadyHasStealth;
                })() && (
                  <button
                    className="w-full text-left rounded bg-violet-900/30 hover:bg-violet-900/50 px-3 py-1"
                    onClick={() => {
                      // Spawn stealth token and attach to this permanent
                      const stealthDef = TOKEN_BY_NAME["stealth"];
                      if (!stealthDef) {
                        log("Stealth token definition not found");
                        onClose();
                        return;
                      }

                      const arr = permanents[t.at] || [];
                      const perm = arr[t.index];
                      if (!perm) {
                        onClose();
                        return;
                      }

                      const ownerNum = perm.owner;
                      const ownerKey = seatFromOwner(ownerNum);
                      const instanceId = `stealth-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`;

                      // Create stealth token card
                      const stealthCard = {
                        cardId: newTokenInstanceId(stealthDef),
                        variantId: null,
                        name: stealthDef.name,
                        type: "Token",
                        slug: tokenSlug(stealthDef),
                        thresholds: null,
                        instanceId,
                      };

                      // Create the permanent item for the token
                      const stealthPermanent = {
                        owner: ownerNum,
                        card: stealthCard,
                        offset: null,
                        tilt: 0,
                        tapVersion: 0,
                        tapped: false,
                        version: 0,
                        instanceId,
                        attachedTo: { at: t.at, index: t.index },
                      };

                      // Add to permanents and update state
                      const permanentsNext = { ...permanents };
                      const tileArr = [...(permanentsNext[t.at] || [])];
                      tileArr.push(stealthPermanent);
                      permanentsNext[t.at] = tileArr;

                      // Update store
                      useGameStore.setState({ permanents: permanentsNext });

                      // Send patch to server
                      const state = useGameStore.getState();
                      if (state.transport) {
                        state.trySendPatch({ permanents: permanentsNext });
                      }

                      const playerNum = ownerKey === "p1" ? "1" : "2";
                      log(
                        `[p${playerNum}card:${perm.card.name}] gains Stealth`
                      );

                      try {
                        playCardFlip();
                      } catch {}
                      onClose();
                    }}
                  >
                    Gain Stealth
                  </button>
                )}

              {/* Ward - for permanents with ward keyword */}
              {t.kind === "permanent" &&
                isMine &&
                hasWardAbility &&
                (() => {
                  // Check if already has ward token attached
                  const alreadyHasWard = attachedTokens?.some(
                    (tk) => tk.name.toLowerCase() === "ward"
                  );
                  return !alreadyHasWard;
                })() && (
                  <button
                    className="w-full text-left rounded bg-cyan-900/30 hover:bg-cyan-900/50 px-3 py-1"
                    onClick={() => {
                      // Spawn ward token and attach to this permanent
                      const wardDef = TOKEN_BY_NAME["ward"];
                      if (!wardDef) {
                        log("Ward token definition not found");
                        onClose();
                        return;
                      }

                      const arr = permanents[t.at] || [];
                      const perm = arr[t.index];
                      if (!perm) {
                        onClose();
                        return;
                      }

                      const ownerNum = perm.owner;
                      const ownerKey = seatFromOwner(ownerNum);
                      const instanceId = `ward-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`;

                      // Create ward token card
                      const wardCard = {
                        cardId: newTokenInstanceId(wardDef),
                        variantId: null,
                        name: wardDef.name,
                        type: "Token",
                        slug: tokenSlug(wardDef),
                        thresholds: null,
                        instanceId,
                      };

                      // Create the permanent item for the token
                      const wardPermanent = {
                        owner: ownerNum,
                        card: wardCard,
                        offset: null,
                        tilt: 0,
                        tapVersion: 0,
                        tapped: false,
                        version: 0,
                        instanceId,
                        attachedTo: { at: t.at, index: t.index },
                      };

                      // Add to permanents and update state
                      const permanentsNext = { ...permanents };
                      const tileArr = [...(permanentsNext[t.at] || [])];
                      tileArr.push(wardPermanent);
                      permanentsNext[t.at] = tileArr;

                      // Update store
                      useGameStore.setState({ permanents: permanentsNext });

                      // Send patch to server
                      const state = useGameStore.getState();
                      if (state.transport) {
                        state.trySendPatch({ permanents: permanentsNext });
                      }

                      const playerNum = ownerKey === "p1" ? "1" : "2";
                      log(`[p${playerNum}card:${perm.card.name}] gains Ward`);

                      try {
                        playCardFlip();
                      } catch {}
                      onClose();
                    }}
                  >
                    Ward
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
                        : "Attach to unit"}
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
                      const isWard = tokenName === "ward";
                      const isConditionToken =
                        isStealth || isDisabled || isWard;

                      // Check if this is a carryable artifact
                      const tokenType = (token.type || "").toLowerCase();
                      const tokenSubTypes = (
                        token.subTypes || ""
                      ).toLowerCase();
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
                      } else if (isConditionToken) {
                        // Condition tokens (Stealth/Disabled/Ward): banish directly - only if we own the parent
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
                                  const tokenIndex =
                                    items.indexOf(detachedToken);
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
                            {isStealth || isWard
                              ? `Break ${token.name}`
                              : `Banish ${token.name}`}
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

              {/* Pith Imp stolen cards section - uses private hand approach */}
              {t.kind === "permanent" &&
                isMine &&
                (() => {
                  const arr = permanents[t.at] || [];
                  const item = arr[t.index];
                  const cardName = (item?.card?.name || "").toLowerCase();
                  if (!cardName.includes("pith imp")) return null;

                  const pithImpHands = useGameStore.getState().pithImpHands;
                  const pithImpEntry = pithImpHands.find(
                    (p) =>
                      p.minion.at === t.at ||
                      (item?.instanceId &&
                        p.minion.instanceId === item.instanceId)
                  );

                  if (!pithImpEntry || pithImpEntry.hand.length === 0)
                    return null;

                  return (
                    <div className="space-y-2">
                      <div className="text-xs text-white/70 px-3 py-1">
                        Stolen Cards ({pithImpEntry.hand.length}):
                      </div>
                      {pithImpEntry.hand.map((card, cardIdx) => (
                        <button
                          key={cardIdx}
                          className="w-full text-left rounded bg-purple-900/20 hover:bg-purple-900/40 px-3 py-1 text-sm"
                          onClick={() => {
                            // Drop stolen card onto the board at Pith Imp's location
                            useGameStore
                              .getState()
                              .dropStolenCard(pithImpEntry.id, cardIdx, {
                                x: Number(t.at.split(",")[0]),
                                y: Number(t.at.split(",")[1]),
                              });
                            onClose();
                          }}
                        >
                          Drop {card.name}
                        </button>
                      ))}
                    </div>
                  );
                })()}

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
                    // Switch Site Position action
                    if (action.actionId === "__switch_site_position__") {
                      return (
                        <button
                          key={action.actionId}
                          className="w-full text-left rounded bg-amber-600/20 hover:bg-amber-600/30 px-3 py-1"
                          title={action.description}
                          onClick={() => {
                            if (t.kind === "site") {
                              setSwitchSiteSource({ x: t.x, y: t.y });
                              log(
                                "Site selected for switch. Click another tile to complete the move."
                              );
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Flood site action - place Flooded token on site
                    if (action.actionId === "__flood_site__") {
                      return (
                        <button
                          key={action.actionId}
                          className="w-full text-left rounded bg-cyan-600/20 hover:bg-cyan-600/30 px-3 py-1"
                          title={action.description}
                          onClick={() => {
                            if (t.kind === "site") {
                              floodSite(t.x, t.y);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Silence site action - place Silenced token on site
                    if (action.actionId === "__silence_site__") {
                      return (
                        <button
                          key={action.actionId}
                          className="w-full text-left rounded bg-violet-600/20 hover:bg-violet-600/30 px-3 py-1"
                          title={action.description}
                          onClick={() => {
                            if (t.kind === "site") {
                              silenceSite(t.x, t.y);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Imposter unmask action
                    if (action.actionId === "__unmask__") {
                      return (
                        <button
                          key={action.actionId}
                          className="w-full text-left rounded bg-purple-600/20 hover:bg-purple-600/30 px-3 py-1"
                          title={action.description}
                          onClick={() => {
                            if (t.kind === "avatar") {
                              unmask(t.who);
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Necromancer summon skeleton action
                    if (action.actionId === "__summon_skeleton__") {
                      return (
                        <button
                          key={action.actionId}
                          className={`w-full text-left rounded px-3 py-1 ${
                            action.isEnabled
                              ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200"
                              : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                          }`}
                          title={action.description}
                          disabled={!action.isEnabled}
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              summonSkeletonHere(t.who);
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Mephistopheles summon Evil minion action
                    if (action.actionId === "__mephistopheles_summon__") {
                      return (
                        <button
                          key={action.actionId}
                          className={`w-full text-left rounded px-3 py-1 ${
                            action.isEnabled
                              ? "bg-red-600/20 hover:bg-red-600/30 text-red-200"
                              : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                          }`}
                          title={action.description}
                          disabled={!action.isEnabled}
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              beginMephistophelesSummon(t.who);
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Pathfinder play site action
                    if (action.actionId === "__pathfinder_play__") {
                      return (
                        <button
                          key={action.actionId}
                          className={`w-full text-left rounded px-3 py-1 ${
                            action.isEnabled
                              ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200"
                              : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                          }`}
                          title={action.description}
                          disabled={!action.isEnabled}
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              beginPathfinderPlay(t.who);
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Druid flip action
                    if (action.actionId === "__flip_druid__") {
                      return (
                        <button
                          key={action.actionId}
                          className={`w-full text-left rounded px-3 py-1 ${
                            action.isEnabled
                              ? "bg-amber-600/20 hover:bg-amber-600/30 text-amber-200"
                              : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                          }`}
                          title={action.description}
                          disabled={!action.isEnabled}
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              flipDruid(t.who);
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Tap to draw site action (standard avatar ability)
                    if (action.actionId === "__tap_draw_site__") {
                      return (
                        <button
                          key={action.actionId}
                          className={`w-full text-left rounded px-3 py-1 ${
                            action.isEnabled
                              ? "bg-teal-600/20 hover:bg-teal-600/30 text-teal-200"
                              : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                          }`}
                          title={action.description}
                          disabled={!action.isEnabled}
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              // Draw from atlas to hand (drawFromPileToHand handles tapping the avatar)
                              const atlas = zones[t.who]?.atlas;
                              if (atlas && atlas.length > 0) {
                                const topCard = atlas[0];
                                setDragFromPile({
                                  who: t.who,
                                  from: "atlas",
                                  card: topCard,
                                });
                                drawFromPileToHand();
                                try {
                                  playCardSelect();
                                } catch {}
                              }
                            }
                            onClose();
                          }}
                        >
                          {action.displayText}
                        </button>
                      );
                    }
                    // Frontier Settlers tap ability
                    if (action.actionId === "__frontier_settlers_ability__") {
                      return (
                        <button
                          key={action.actionId}
                          className={`w-full text-left rounded px-3 py-1 ${
                            action.isEnabled
                              ? "bg-green-600/20 hover:bg-green-600/30 text-green-200"
                              : "bg-gray-600/20 text-gray-400 cursor-not-allowed"
                          }`}
                          title={action.description}
                          disabled={!action.isEnabled}
                          onClick={() => {
                            if (t.kind === "permanent" && action.isEnabled) {
                              const at = t.at;
                              const idx = t.index;
                              const itm = (permanents[at] || [])[idx];
                              if (itm) {
                                const ownerSeat = seatFromOwner(itm.owner);
                                triggerFrontierSettlersAbility({
                                  minion: {
                                    at,
                                    index: idx,
                                    instanceId: itm.instanceId ?? null,
                                    owner: itm.owner as 1 | 2,
                                    card: itm.card,
                                  },
                                  ownerSeat,
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

              {(doDrawFromPile ||
                doDrawFromPileBottom ||
                doShufflePile ||
                doSearchPile) && (
                <div className="space-y-2">
                  {doDrawFromPile && (
                    <button
                      className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                      onClick={doDrawFromPile}
                    >
                      Draw top
                    </button>
                  )}
                  {doDrawFromPileBottom && (
                    <button
                      className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                      onClick={doDrawFromPileBottom}
                    >
                      Draw from bottom
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
    </>
  );
}
