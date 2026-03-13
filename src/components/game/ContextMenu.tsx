"use client";
import { Icon } from "@iconify/react";
import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  isNecromancer,
  isDruid,
  hasTapToDrawSite,
  isMephistopheles,
  isPathfinder,
  isGeomancer,
  isSavior,
  isImposter,
} from "@/lib/game/avatarAbilities";
import {
  detectBurrowSubmergeAbilities,
  detectBurrowSubmergeAbilitiesSync,
  detectCarryAbility,
  detectCarryAbilitySync,
  detectLanceAbility,
  detectLanceAbilitySync,
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
import { isMergedTower } from "@/lib/game/store/babelTowerState";
import { GEM_COLORS } from "@/lib/game/store/gemTokenState";
import { isHyperparasite } from "@/lib/game/store/hyperparasiteState";
import { isMasked } from "@/lib/game/store/imposterMaskState";
import {
  isMonumentByName,
  isAutomatonByName,
} from "@/lib/game/store/omphalosState";
import {
  NECROMANCER_SKELETON_COST,
  SAVIOR_WARD_COST,
  IMPOSTER_MASK_COST,
} from "@/lib/game/store/types";
import {
  getCellNumber,
  parseCellKey,
  seatFromOwner,
  toCellKey,
  opponentOwner,
} from "@/lib/game/store/utils/boardHelpers";
import {
  siteHasSilencedToken,
  siteHasDisabledToken,
} from "@/lib/game/store/utils/resourceHelpers";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
  isMinionToken,
} from "@/lib/game/tokens";
import type { ContextMenuAction } from "@/lib/game/types";

interface MenuBtnProps {
  icon?: string;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}

function MenuBtn({
  icon,
  label,
  onClick,
  className = "bg-white/10 hover:bg-white/20",
  disabled,
  title,
}: MenuBtnProps) {
  const iconMode = useGameStore((s) => s.contextMenuIcons);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);

  if (iconMode && icon) {
    const tooltipText = title ?? label;
    return (
      <>
        <button
          ref={btnRef}
          disabled={disabled}
          onClick={onClick}
          onMouseEnter={() => {
            const r = btnRef.current?.getBoundingClientRect();
            if (r) setTipPos({ x: r.left + r.width / 2, y: r.top });
          }}
          onMouseLeave={() => setTipPos(null)}
          className={`rounded ${className} p-2 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Icon icon={icon} width={20} height={20} />
        </button>
        {tipPos &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[9999] px-2 py-0.5 rounded bg-black/90 text-white text-xs whitespace-nowrap -translate-x-1/2 -translate-y-full -mt-1"
              style={{ left: tipPos.x, top: tipPos.y - 4 }}
            >
              {tooltipText}
            </div>,
            document.body,
          )}
      </>
    );
  }
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left rounded ${className} px-3 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );
}

interface ContextMenuProps {
  onClose: () => void;
}

export default function ContextMenu({ onClose }: ContextMenuProps) {
  const { playCardFlip, playCardShuffle, playCardSelect } = useSound();
  const contextMenu = useGameStore((s) => s.contextMenu);
  const board = useGameStore((s) => s.board);
  const babelTowers = useGameStore((s) => s.babelTowers);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const zones = useGameStore((s) => s.zones);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const turn = useGameStore((s) => s.turn);
  const players = useGameStore((s) => s.players);
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
    (s) => s.moveSiteToGraveyardWithRubble,
  );
  const transformSite = useGameStore((s) => s.transformSite);
  const floodSite = useGameStore((s) => s.floodSite);
  const silenceSite = useGameStore((s) => s.silenceSite);
  const disableSite = useGameStore((s) => s.disableSite);
  const silencePermanent = useGameStore((s) => s.silencePermanent);
  const movePermanentToZone = useGameStore((s) => s.movePermanentToZone);
  const transferSiteControl = useGameStore((s) => s.transferSiteControl);
  const transferPermanentControl = useGameStore(
    (s) => s.transferPermanentControl,
  );
  const copyPermanent = useGameStore((s) => s.copyPermanent);
  const drawFromPileToHand = useGameStore((s) => s.drawFromPileToHand);
  const moveFromGraveyardToBanished = useGameStore(
    (s) => s.moveFromGraveyardToBanished,
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
    (s) => s.attachPermanentToAvatar,
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
    (s) => s.necromancerSkeletonUsed,
  );
  const summonSkeletonHere = useGameStore((s) => s.summonSkeletonHere);
  const mephistophelesSummonUsed = useGameStore(
    (s) => s.mephistophelesSummonUsed,
  );
  const beginMephistophelesSummon = useGameStore(
    (s) => s.beginMephistophelesSummon,
  );
  const pathfinderUsed = useGameStore((s) => s.pathfinderUsed);
  const beginPathfinderPlay = useGameStore((s) => s.beginPathfinderPlay);
  const geomancerRubbleUsed = useGameStore((s) => s.geomancerRubbleUsed);
  const beginGeomancerRubble = useGameStore((s) => s.beginGeomancerRubble);
  const druidFlipped = useGameStore((s) => s.druidFlipped);
  const flipDruid = useGameStore((s) => s.flipDruid);
  const getAvailableMana = useGameStore((s) => s.getAvailableMana);
  const getThresholdTotals = useGameStore((s) => s.getThresholdTotals);
  const beginAnnualFair = useGameStore((s) => s.beginAnnualFair);
  const triggerFrontierSettlersAbility = useGameStore(
    (s) => s.triggerFrontierSettlersAbility,
  );
  const _hasFrontierSettlersAbility = useGameStore(
    (s) => s.hasFrontierSettlersAbility,
  );
  const interactionGuides = useGameStore((s) => s.interactionGuides);

  // Assimilator Snail activated ability
  const assimilatorSnailUsed = useGameStore((s) => s.assimilatorSnailUsed);
  const beginAssimilatorSnail = useGameStore((s) => s.beginAssimilatorSnail);
  const assimilatorSnailTransforms = useGameStore(
    (s) => s.assimilatorSnailTransforms,
  );
  const revertAssimilatorSnailTransforms = useGameStore(
    (s) => s.revertAssimilatorSnailTransforms,
  );

  // Generic carry actions
  const carryPickUp = useGameStore((s) => s.carryPickUp);
  const carryDrop = useGameStore((s) => s.carryDrop);
  const carryPickUpAvatar = useGameStore((s) => s.carryPickUpAvatar);
  const carryDropAvatar = useGameStore((s) => s.carryDropAvatar);
  // Piracy actions (Captain Baldassare / Sea Raider)
  const triggerPiracy = useGameStore((s) => s.triggerPiracy);

  // Gem token actions
  const gemTokens = useGameStore((s) => s.gemTokens);
  const duplicateGemToken = useGameStore((s) => s.duplicateGemToken);
  const destroyGemToken = useGameStore((s) => s.destroyGemToken);

  // Hand card actions
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const moveCardFromHandToPile = useGameStore((s) => s.moveCardFromHandToPile);
  const setCastSubsurface = useGameStore((s) => s.setCastSubsurface);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);

  // Permanent position management (burrow/submerge)
  const getAvailableActions = useGameStore((s) => s.getAvailableActions);
  const updatePermanentState = useGameStore((s) => s.updatePermanentState);
  const setPermanentAbility = useGameStore((s) => s.setPermanentAbility);
  const iconMode = useGameStore((s) => s.contextMenuIcons);

  const menuRef = useRef<HTMLDivElement | null>(null);
  // Track when the context menu was mounted to prevent immediate dismiss on
  // mobile double-tap (the click event from the second tap hits the backdrop)
  const openedAtRef = useRef<number>(Date.now());
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [positionActions, setPositionActions] = useState<ContextMenuAction[]>(
    [],
  );
  // Track if current permanent/site has stealth/ward/lance/carry keyword ability
  const [hasStealthAbility, setHasStealthAbility] = useState(false);
  const [hasWardAbility, setHasWardAbility] = useState(false);
  const [hasLanceAbility, setHasLanceAbility] = useState(false);
  const [hasCarryAbility, setHasCarryAbility] = useState(false);
  const [siteHasWardAbility, setSiteHasWardAbility] = useState(false);
  // Token names this site can spawn based on its rulesText keywords
  const [siteSpawnableTokens, setSiteSpawnableTokens] = useState<string[]>([]);
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
    const ro = new ResizeObserver(() => compute());
    if (menuRef.current) ro.observe(menuRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [contextMenu]);

  // Handle permanent ability setup and position actions
  useEffect(() => {
    if (!contextMenu) {
      setPositionActions([]);
      setHasStealthAbility(false);
      setHasWardAbility(false);
      setHasLanceAbility(false);
      setHasCarryAbility(false);
      setSiteHasWardAbility(false);
      setSiteSpawnableTokens([]);
      return;
    }
    // Record when context menu opened so backdrop can ignore taps in a grace period
    openedAtRef.current = Date.now();

    // Detect ward ability and token-spawning keywords for sites
    const t = contextMenu.target;
    if (t.kind === "site") {
      const key = toCellKey(t.x, t.y);
      const site = board.sites[key];
      if (site?.card?.name) {
        const cardName = site.card.name;
        (async () => {
          const hasWard = await detectWardAbility(cardName);
          setSiteHasWardAbility(hasWard);

          // Check rulesText for token-spawning keywords (frog, foot soldier, skeleton, lance)
          try {
            const resp = await fetch(
              `/api/cards/rules?name=${encodeURIComponent(cardName)}`,
            );
            if (resp.ok) {
              const data = await resp.json();
              const rules = ((data.rulesText as string) || "").toLowerCase();
              const spawnable: string[] = [];
              if (rules.includes("frog")) spawnable.push("frog");
              if (rules.includes("foot soldier"))
                spawnable.push("foot soldier");
              if (rules.includes("skeleton")) spawnable.push("skeleton");
              if (rules.includes("lance")) spawnable.push("lance");
              setSiteSpawnableTokens(spawnable);
            } else {
              setSiteSpawnableTokens([]);
            }
          } catch {
            setSiteSpawnableTokens([]);
          }
        })();
      } else {
        setSiteHasWardAbility(false);
        setSiteSpawnableTokens([]);
      }
    } else {
      setSiteHasWardAbility(false);
      setSiteSpawnableTokens([]);
    }

    if (t.kind === "permanent") {
      const item = permanents[t.at]?.[t.index];
      if (item?.card) {
        // Use instanceId for stable identification (prevents state leakage on card movement)
        const permanentId = item.instanceId ?? `perm:${t.at}:${t.index}`;

        // Fetch abilities asynchronously from API
        (async () => {
          try {
            // Detect stealth, ward, lance, and carry abilities
            const hasStealth = await detectStealthAbility(item.card.name);
            setHasStealthAbility(hasStealth);
            const hasWard = await detectWardAbility(item.card.name);
            setHasWardAbility(hasWard);
            const hasLance = await detectLanceAbility(item.card.name);
            setHasLanceAbility(hasLance);
            const hasCarry = await detectCarryAbility(item.card.name);
            setHasCarryAbility(hasCarry);

            const abilities = await detectBurrowSubmergeAbilities(
              item.card.name,
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
              state.permanentPositions[permanentId],
            );
            console.log(
              "Debug - Ability data:",
              state.permanentAbilities[permanentId],
            );
            console.log(
              "Debug - All positions:",
              Object.keys(state.permanentPositions),
            );
            console.log(
              "Debug - All abilities:",
              Object.keys(state.permanentAbilities),
            );

            setPositionActions(actions);
          } catch (error) {
            console.warn(
              "Failed to fetch abilities for",
              item.card.name,
              error,
            );
            // Fallback to sync detection as backup
            setHasStealthAbility(detectStealthAbilitySync(item.card.name));
            setHasWardAbility(detectWardAbilitySync(item.card.name));
            setHasLanceAbility(detectLanceAbilitySync(item.card.name));
            setHasCarryAbility(detectCarryAbilitySync(item.card.name));
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
  }, [
    contextMenu,
    permanents,
    setPermanentAbility,
    getAvailableActions,
    board.sites,
  ]);

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
    // Check if this is a merged Tower of Babel (Base + Apex stacked)
    const towerMerge = isMergedTower(key, babelTowers);
    header = towerMerge
      ? "The Tower of Babel"
      : site?.card?.name ||
        `Site #${getCellNumber(t.x, t.y, board.size.w, board.size.h)}`;
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

    // Acting player can transfer control of any site (steal effects)
    if (site && (isMine || isActingPlayer)) {
      transferTo = opponentOwner(site.owner);
      doTransfer = () => {
        transferSiteControl(t.x, t.y);
        onClose();
      };
    }

    // Acting player can bounce any site to hand (unsummon, bounce effects)
    if (isMine || isActingPlayer) {
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
      (isMine || isActingPlayer) &&
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
        description: "Swap with another site or move to void tile.",
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
          "Add Flooded token (water threshold).",
      });
    }

    // Disable - place a Disabled token on this site (removes mana, threshold, and abilities)
    if (site && (isMine || isActingPlayer)) {
      extraActions.push({
        actionId: "__disable_site__",
        displayText: "Disable",
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Add Disabled token (no mana/threshold).",
      });
    }

    // Silence - place a Silenced token on this site (removes textbox abilities only)
    if (site && (isMine || isActingPlayer)) {
      extraActions.push({
        actionId: "__silence_site__",
        displayText: "Silence",
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Add Silenced token (no abilities, keeps mana).",
      });
    }

    // Unsilence - remove Silenced token from this site
    const cellKey = site ? toCellKey(t.x, t.y) : "";
    if (
      site &&
      (isMine || isActingPlayer) &&
      siteHasSilencedToken(cellKey, permanents)
    ) {
      extraActions.push({
        actionId: "__unsilence_site__",
        displayText: "Unsilence",
        isEnabled: true,
        targetPermanentId: "",
        description: "Remove Silenced token.",
      });
    }

    // Undisable - remove Disabled token from this site
    if (
      site &&
      (isMine || isActingPlayer) &&
      siteHasDisabledToken(cellKey, permanents)
    ) {
      extraActions.push({
        actionId: "__undisable_site__",
        displayText: "Undisable",
        isEnabled: true,
        targetPermanentId: "",
        description: "Remove Disabled token.",
      });
    }

    // Annual Fair - activated ability: (1) → Gain (A), (E), (F), or (W) this turn
    const siteName = site?.card?.name || "";
    if (
      isMine &&
      siteName.toLowerCase() === "annual fair" &&
      getAvailableMana(ownerKey || "p1") >= 1
    ) {
      extraActions.push({
        actionId: "__annual_fair_activate__",
        displayText: "🎪 Activate (1)",
        isEnabled: true,
        targetPermanentId: "",
        description:
          "Pay (1) to gain Air, Water, Earth, or Fire threshold this turn.",
      });
    }

    // Transform site into minion (Island Leviathan, Horns of Behemoth)
    const siteNameLc = siteName.toLowerCase();
    const isIslandLeviathan = siteNameLc.includes("island leviathan");
    const isHornsOfBehemoth = siteNameLc.includes("horns of behemoth");
    if (isMine && (isIslandLeviathan || isHornsOfBehemoth)) {
      const thresholds = getThresholdTotals(ownerKey || "p1");
      const requiredElement = isIslandLeviathan ? "water" : "fire";
      const requiredAmount = isIslandLeviathan ? 8 : 6;
      const currentAmount = thresholds[requiredElement];
      const meetsThreshold = currentAmount >= requiredAmount;
      const transformDescription = isIslandLeviathan
        ? `If you have 8 water threshold — Transform into a Monster with 8 strength. Place Rubble underneath. (Current: ${currentAmount} water)`
        : `If you have 6 fire threshold — Transform into a Demon with 6 strength. Place Rubble underneath. (Current: ${currentAmount} fire)`;

      extraActions.push({
        actionId: "__transform_site__",
        displayText: `Transform${meetsThreshold ? "" : " ⚠️"}`,
        isEnabled: true,
        targetPermanentId: "",
        description: transformDescription,
      });
    }
  } else if (t.kind === "permanent") {
    const arr = permanents[t.at] || [];
    const item = arr[t.index];
    header = item?.card?.name || "Permanent";
    tapped = !!item?.tapped;
    const ownerKey = item ? seatFromOwner(item.owner) : null;
    const canActOnline = !!actorKey;
    const isActingPlayer =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2) ||
      !actorKey;
    const canToggle =
      !actorKey || (ownerKey && actorKey === ownerKey) || isActingPlayer;
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

    // Flip (face-down/face-up) for permanents
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
    // Acting player can transfer control of any permanent (steal effects)
    if (item && (isMine || isActingPlayer)) {
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
            perm.attachedTo.index === t.index,
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

    if (isToken && (isMine || isActingPlayer)) {
      const nonTokenIndices = arr
        .map((it, i) => ({ it, i }))
        .filter(
          ({ it }) => !(it.card.type || "").toLowerCase().includes("token"),
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
          }),
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
              possibleTargets.length,
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
                item.card.name,
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
    } else {
      // Handle carryable artifacts (attach only - detach is on the unit's menu)
      // Allow either seated player to pick up an unattached carryable artifact,
      // and transfer control to the holder on attach.
      const canPickUpCarryableArtifact =
        isCarryableArtifactType &&
        !item?.attachedTo &&
        (isMine || canActOnline);

      if (canPickUpCarryableArtifact) {
        // Artifact is not attached - provide attach option
        // Check for minions (non-artifact permanents) on the same tile
        const nonArtifactPermanents = arr
          .map((it, i) => ({ it, i }))
          .filter(({ it, i }) => {
            const type = (it.card.type || "").toLowerCase();
            const name = it.card.name || "";
            // Allow minions and minion tokens (Skeleton, Frog, Foot Soldier, Bruin, Tawny)
            // Block artifacts, sites, and non-minion tokens (Lance, Ward, Disabled, etc.)
            const isToken = type.includes("token");
            const isValidTarget =
              !type.includes("artifact") &&
              !type.includes("site") &&
              (!isToken || isMinionToken(name));
            return isValidTarget && i !== t.index; // Exclude the artifact itself
          });

        // Check if there's any avatar on this tile (either player's)
        // Allow both players to pick up dropped artifacts
        const [artifactX, artifactY] = t.at.split(",").map(Number);

        // Build list of all possible attachment targets
        const possibleTargets: AttachmentTarget[] = [];

        // Add all minions as potential targets (from either player)
        for (const { it, i } of nonArtifactPermanents) {
          possibleTargets.push({
            type: "permanent",
            index: i,
            card: it.card,
            displayName: it.card.name,
          });
        }

        // Check both players' avatars on this tile
        for (const avatarKey of ["p1", "p2"] as const) {
          const avatar = avatars[avatarKey];
          const avatarPos =
            Array.isArray(avatar?.pos) && avatar.pos.length === 2
              ? avatar.pos
              : null;
          const isOnTile =
            avatarPos &&
            avatarPos[0] === artifactX &&
            avatarPos[1] === artifactY;

          if (isOnTile && avatar?.card) {
            possibleTargets.push({
              type: "avatar",
              index: -1,
              card: avatar.card,
              displayName: `${avatarKey.toUpperCase()} Avatar`,
              avatarKey, // Store which avatar for attachment
            });
          }
        }

        // Can attach to minion or avatar
        const hasAttachableTarget = possibleTargets.length > 0;

        if (hasAttachableTarget) {
          doAttachToken = () => {
            console.log(
              "[ContextMenu] Artifact attach clicked, targets:",
              possibleTargets.length,
              possibleTargets,
            );
            // If only one target, attach directly (old behavior)
            if (possibleTargets.length === 1) {
              const target = possibleTargets[0];
              if (target.type === "avatar" && target.avatarKey) {
                attachPermanentToAvatar(t.at, t.index, target.avatarKey);
              } else {
                attachTokenToPermanent(t.at, t.index, target.index);
                log(
                  `Attached artifact '${item.card.name}' to ${target.displayName}`,
                );
              }
              onClose();
            } else {
              // Multiple targets: show selection dialog (don't close menu yet)
              console.log(
                "[ContextMenu] Opening attachment dialog for artifact",
                item.card.name,
              );
              setAttachmentDialog({
                artifactName: item.card.name,
                artifactAt: t.at,
                artifactIndex: t.index,
                targets: possibleTargets,
              });
              console.log(
                "[ContextMenu] Dialog state set, targets:",
                possibleTargets,
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

      // Silence action for auras and minions (place Silenced token on the permanent)
      const permanentType = (item?.card?.type || "").toLowerCase();
      const permanentSubTypes = (item?.card?.subTypes || "").toLowerCase();
      const isAura =
        permanentType.includes("aura") || permanentSubTypes.includes("aura");
      const isMinion = permanentType.includes("minion");
      const isArtifactWithAbility = permanentType.includes("artifact");
      const canSilence = isAura || isMinion || isArtifactWithAbility;

      if (canSilence) {
        extraActions.push({
          actionId: "__silence_permanent__",
          displayText: "Silence",
          isEnabled: true,
          targetPermanentId: "",
          description:
            "Add Silenced token (no abilities).",
        });
      }
    }

    // Captain Baldassare / Sea Raider piracy action
    const permName = (item?.card?.name || "").toLowerCase();
    const isCaptainBaldassare = permName === "captain baldassare";
    const isSeaRaider = permName === "sea raider";
    if ((isCaptainBaldassare || isSeaRaider) && isMine) {
      const piracyLabel = isCaptainBaldassare
        ? "Piracy (discard 3)"
        : "Piracy (discard 1)";
      extraActions.push({
        actionId: "__piracy_trigger__",
        displayText: piracyLabel,
        isEnabled: true,
        targetPermanentId: "",
        description: isCaptainBaldassare
          ? "Discard top 3 opponent spells, cast free."
          : "Discard top opponent spell, cast free.",
      });
    }

    // Monument move action (monuments can be relocated via context menu)
    if (isMonument && (isMine || isActingPlayer)) {
      extraActions.push({
        actionId: "__move_monument__",
        displayText: "Move Monument",
        isEnabled: true,
        targetPermanentId: "",
        description: "Move this monument to another tile on the board.",
      });
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
      // Also check for enemy avatar on the same tile
      const enemyAvatarHere = (() => {
        if (enemyOwner == null) return false;
        const enemySeat = enemyOwner === 1 ? "p1" : "p2";
        const av = avatars?.[enemySeat];
        if (!av || !Array.isArray(av.pos) || av.pos.length !== 2) return false;
        return av.pos[0] === x && av.pos[1] === y;
      })();
      const canAttackHere =
        canAct && !tapped && (unitsHere || siteHereEnemy || enemyAvatarHere);
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

      if (canAttackHere && item && interactionGuides) {
        // Insert button to render later
        extraActions.push({
          actionId: "__attack_here__",
          displayText: "Attack here",
          isEnabled: true,
          targetPermanentId: "",
          description: "Start an attack on this tile",
        });
      }

      if (rangedTargets.length > 0 && item && interactionGuides) {
        for (const p of rangedTargets) {
          const cellNo = getCellNumber(p.x, p.y, board.size.w, board.size.h);
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
          "Reveal original avatar, banish mask.",
      });
    }

    // Imposter mask action (if player has Imposter avatar and avatars in collection)
    // Check if avatar is Imposter (either currently or originally if masked)
    const currentAvatarName = a?.card?.name;
    const originalImposterAvatar = imposterMasks[t.who]?.originalAvatar;
    const isImposterAvatar = isImposter(
      originalImposterAvatar?.name ?? currentAvatarName,
    );
    const collectionAvatars = (zones[t.who]?.collection || []).filter((card) =>
      card.type?.toLowerCase().includes("avatar"),
    );
    const hasAvatarsInCollection = collectionAvatars.length > 0;

    if (isMine && isImposterAvatar && hasAvatarsInCollection) {
      const currentMana = getAvailableMana(t.who);
      const hasEnoughManaForMask = currentMana >= IMPOSTER_MASK_COST;
      let maskDescription = `Choose avatar to mask as (${IMPOSTER_MASK_COST} mana).`;
      if (!hasEnoughManaForMask) {
        maskDescription = `Warning: not enough mana (need ${IMPOSTER_MASK_COST}, have ${currentMana})`;
      }

      extraActions.push({
        actionId: "__imposter_mask__",
        displayText: `Mask (${IMPOSTER_MASK_COST} mana)`,
        isEnabled: true, // Always enabled - mana check is a warning
        targetPermanentId: "",
        description: maskDescription,
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
      const canSummon = isMyTurn && !hasAlreadyUsed && hasPosition;
      let description = `Summon Skeleton here (${NECROMANCER_SKELETON_COST} mana, 1/turn).`;
      if (!isMyTurn) description = "Can only summon skeleton on your turn";
      else if (hasAlreadyUsed)
        description = "Already summoned a skeleton this turn";
      else if (!hasEnoughMana)
        description = `Warning: not enough mana (need ${NECROMANCER_SKELETON_COST}, have ${availableMana})`;
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
        "Summon Evil minion to adjacent site (1/turn).";
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
      console.log("[PATHFINDER] ContextMenu check:", {
        who: t.who,
        pathfinderUsed,
        pathfinderHasAlreadyUsed,
        isMyTurn,
        isTapped: a?.tapped,
        hasPosition,
        atlasCount: zones[t.who]?.atlas?.length,
      });
      const isNotTapped = !a?.tapped;
      const atlasCount = zones[t.who]?.atlas?.length ?? 0;
      const canPlay =
        isMyTurn &&
        !pathfinderHasAlreadyUsed &&
        isNotTapped &&
        hasPosition &&
        atlasCount > 0;
      let pathDescription =
        "Tap: play top atlas site to adjacent void/Rubble, move there.";
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

    // Geomancer rubble replacement (tap → replace adjacent Rubble with top atlas site)
    const geomancerHasAlreadyUsed = geomancerRubbleUsed[t.who];
    if (isMine && isGeomancer(effectiveAvatarName)) {
      const isNotTapped = !a?.tapped;
      const atlasCount = zones[t.who]?.atlas?.length ?? 0;
      const canReplace =
        isMyTurn &&
        !geomancerHasAlreadyUsed &&
        isNotTapped &&
        hasPosition &&
        atlasCount > 0;
      let geoDescription =
        "Tap: replace adjacent Rubble with top atlas site.";
      if (!isMyTurn) geoDescription = "Can only use on your turn";
      else if (geomancerHasAlreadyUsed)
        geoDescription = "Already used Geomancer ability this turn";
      else if (!isNotTapped) geoDescription = "Geomancer is already tapped";
      else if (!hasPosition) geoDescription = "Avatar must be on the board";
      else if (atlasCount === 0) geoDescription = "No sites remaining in atlas";

      extraActions.push({
        actionId: "__geomancer_rubble__",
        displayText: `Replace Rubble${geomancerHasAlreadyUsed ? " ✓" : ""}`,
        isEnabled: canReplace,
        targetPermanentId: "",
        description: geoDescription,
      });
    }

    // Druid flip action (tap → flip, summon Bruin, one-way transformation)
    const hasAlreadyFlipped = druidFlipped[t.who];
    if (isMine && isDruid(effectiveAvatarName)) {
      const isNotTapped = !a?.tapped;
      const canFlip = !hasAlreadyFlipped && isNotTapped && hasPosition;
      let flipDescription =
        "Tap: flip Druid, summon Bruin (permanent).";
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
      const avatarAlreadyTapped = tapped;
      const canDraw = atlasCount > 0 && !avatarAlreadyTapped;
      const drawDescription = avatarAlreadyTapped
        ? "Avatar is already tapped"
        : atlasCount > 0
          ? "Tap avatar to draw the top site from your Atlas"
          : "Atlas is empty";

      extraActions.push({
        actionId: "__tap_draw_site__",
        displayText: "Tap & Draw Site",
        isEnabled: canDraw,
        targetPermanentId: "",
        description: drawDescription,
      });
    }

    // Avatar "Attack here" action - same as minions
    const avatarPos2 =
      Array.isArray(a?.pos) && a.pos.length === 2 ? a.pos : null;
    if (isMine && avatarPos2 && interactionGuides) {
      const [avX, avY] = avatarPos2;
      const avatarTileKey2 = toCellKey(avX, avY);
      const avatarOwner2: 1 | 2 = t.who === "p1" ? 1 : 2;
      const enemyOwner2: 1 | 2 = avatarOwner2 === 1 ? 2 : 1;
      const tilePermanents2 = permanents[avatarTileKey2] || [];
      const enemyUnitsHere = tilePermanents2.some(
        (p) => p && p.owner === enemyOwner2,
      );
      const enemySiteHere = board.sites[avatarTileKey2]?.owner === enemyOwner2;
      // Also check for enemy avatar on the same tile
      const enemyAvatarHere2 = (() => {
        const enemySeat2 = enemyOwner2 === 1 ? "p1" : "p2";
        const av2 = avatars?.[enemySeat2];
        if (!av2 || !Array.isArray(av2.pos) || av2.pos.length !== 2)
          return false;
        return av2.pos[0] === avX && av2.pos[1] === avY;
      })();
      const canAvatarAttackHere =
        !tapped &&
        isMyTurn &&
        (enemyUnitsHere || enemySiteHere || enemyAvatarHere2);

      if (canAvatarAttackHere) {
        extraActions.push({
          actionId: "__avatar_attack_here__",
          displayText: "Attack here",
          isEnabled: true,
          targetPermanentId: "",
          description: "Start an attack from this avatar on this tile",
        });
      }
    }

    // Find artifacts attached to this avatar (attachedTo.index === -1)
    // Must filter by owner to prevent showing another player's artifacts when both share a tile
    const avatarPos =
      Array.isArray(a?.pos) && a.pos.length === 2 ? a.pos : null;
    if (avatarPos) {
      const [ax, ay] = avatarPos;
      const avatarTileKey = toCellKey(ax, ay);
      const avatarOwner = t.who === "p1" ? 1 : 2;
      const tilePermanents = permanents[avatarTileKey] || [];
      attachedTokens = tilePermanents
        .map((perm, idx) => ({ perm, idx }))
        .filter(
          ({ perm }) =>
            perm.attachedTo &&
            perm.attachedTo.at === avatarTileKey &&
            perm.attachedTo.index === -1 &&
            perm.owner === avatarOwner,
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
    // Shuffling own piles is allowed even when it's not your turn
    if (isMine && (t.from === "spellbook" || t.from === "atlas")) {
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
                    `Requested consent to draw ${selectedCard.name} from opponent's cemetery`,
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
            },
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
      const tokenCards = (TOKEN_DEFS || [])
        .filter((def: { markerOnly?: boolean }) => !def.markerOnly)
        .map((def: { name: string; key: string; size?: string }) => ({
          cardId: -1,
          variantId: null,
          name: def.name,
          type: "Token",
          slug: tokenSlug(def),
          thresholds: null,
        })) as CardRef[];
      openSearchDialog("Tokens", tokenCards, (selected) => {
        addTokenToHand(who, selected.name);
      });
      onClose();
    };
  } else if (t.kind === "gemToken") {
    // Find the gem token by ID
    const gemToken = gemTokens.find((g) => g.id === t.tokenId);
    const colorInfo = GEM_COLORS.find((c) => c.id === gemToken?.color);
    header = gemToken
      ? `${colorInfo?.label || gemToken.color} Gem`
      : "Gem Token";
  } else if (t.kind === "handCard") {
    header = t.card.name || "Hand Card";
  }

  const label = tapped ? "Untap" : "Tap";

  // Handle attachment target selection
  const handleAttachmentTargetSelect = (target: AttachmentTarget) => {
    if (!attachmentDialog) return;

    const { artifactAt, artifactIndex } = attachmentDialog;
    const arr = permanents[artifactAt] || [];
    const artifact = arr[artifactIndex];
    if (!artifact) return;

    if (target.type === "avatar" && target.avatarKey) {
      // Attach to avatar - use target's avatarKey (the avatar being attached to)
      attachPermanentToAvatar(artifactAt, artifactIndex, target.avatarKey);
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
        className="fixed inset-0 z-30"
        onClick={() => {
          // Ignore clicks within 400ms of opening to prevent double-tap dismiss on mobile.
          // The second tap's click event fires after pointerDown opens the menu,
          // hitting the newly-rendered backdrop immediately.
          if (Date.now() - openedAtRef.current < 400) return;
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ display: attachmentDialog || rubbleDialog ? "none" : "block" }}
      >
        <div
          ref={menuRef}
          className="fixed bg-zinc-900/90 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg p-3 w-56 text-white pointer-events-auto max-h-[80vh] overflow-y-auto"
          style={{
            left: (menuPos?.left ?? contextMenu?.screen?.x ?? 16) + "px",
            top: (menuPos?.top ?? contextMenu?.screen?.y ?? 16) + "px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <div
              className="text-sm font-semibold mb-2 truncate"
              title={header}
            >
              {header}
            </div>
            <div className={iconMode ? "flex flex-wrap gap-1" : "space-y-2"}>
              {hasToggle && doToggle && (
                <MenuBtn
                  icon="game-icons:clockwise-rotation"
                  label={label}
                  onClick={doToggle}
                />
              )}

              {doFlip && (
                <MenuBtn
                  icon={isFaceDown ? "game-icons:all-seeing-eye" : "game-icons:semi-closed-eye"}
                  label={isFaceDown ? "Flip face-up" : "Flip face-down"}
                  onClick={doFlip}
                />
              )}

              {doTransfer && (
                <MenuBtn
                  icon="game-icons:swap-bag"
                  label={`Transfer control${transferTo ? ` to P${transferTo}` : ""}`}
                  onClick={doTransfer}
                />
              )}

              {/* Copy permanent - creates a token copy that goes to banished when leaving */}
              {t.kind === "permanent" && isMine && (
                <MenuBtn
                  icon="game-icons:two-shadows"
                  label="Copy (token)"
                  className="bg-cyan-900/30 hover:bg-cyan-900/50"
                  onClick={() => {
                    copyPermanent(t.at, t.index);
                    try {
                      playCardFlip();
                    } catch {}
                    onClose();
                  }}
                />
              )}

              {/* Assimilator Snail - activated ability: banish dead minion, become copy */}
              {t.kind === "permanent" &&
                isMine &&
                (() => {
                  const arr = permanents[t.at] || [];
                  const item = arr[t.index];
                  if (!item?.card) return null;
                  const name = (item.card.name || "").toLowerCase();
                  if (name !== "assimilator snail") return null;
                  const ownerSeat = seatFromOwner(item.owner);
                  const currentSeat = currentPlayer === 1 ? "p1" : "p2";
                  const isMyTurn = ownerSeat === currentSeat;
                  const hasUsed = assimilatorSnailUsed[ownerSeat];
                  const canActivate = isMyTurn && !hasUsed;
                  const description = hasUsed
                    ? "Already used this turn"
                    : !isMyTurn
                      ? "Can only activate on your turn"
                      : "Banish dead minion, become copy until next turn.";
                  return (
                    <button
                      className={`w-full text-left rounded px-3 py-1 ${
                        canActivate
                          ? "bg-purple-600/30 hover:bg-purple-600/50"
                          : "bg-gray-600/20 text-white/40 cursor-not-allowed"
                      }`}
                      title={description}
                      disabled={!canActivate}
                      onClick={() => {
                        if (!canActivate) return;
                        beginAssimilatorSnail({
                          snail: {
                            at: t.at,
                            index: t.index,
                            instanceId:
                              item.instanceId ?? item.card.instanceId ?? null,
                            owner: item.owner,
                            card: item.card,
                          },
                          activatorSeat: ownerSeat,
                        });
                        onClose();
                      }}
                    >
                      {`Assimilate Dead Minion${hasUsed ? " \u2713" : ""}`}
                    </button>
                  );
                })()}

              {/* Assimilator Snail - Revert to original (failsafe) */}
              {t.kind === "permanent" &&
                isMine &&
                (() => {
                  const arr = permanents[t.at] || [];
                  const item = arr[t.index];
                  if (!item?.card) return null;
                  const itemInstanceId =
                    item.instanceId ?? item.card.instanceId ?? null;
                  if (!itemInstanceId) return null;
                  // Check if this permanent is a transformed Assimilator Snail
                  const transform = assimilatorSnailTransforms.find(
                    (tr) => tr.snailInstanceId === itemInstanceId,
                  );
                  if (!transform) return null;
                  return (
                    <button
                      className="w-full text-left rounded bg-purple-600/30 hover:bg-purple-600/50 px-3 py-1"
                      title="Revert this copy back to Assimilator Snail"
                      onClick={() => {
                        revertAssimilatorSnailTransforms(transform.ownerSeat);
                        onClose();
                      }}
                    >
                      Revert to Assimilator Snail
                    </button>
                  );
                })()}

              {/* Generic Carry - Pick Up buttons for each eligible target */}
              {t.kind === "permanent" &&
                isMine &&
                hasCarryAbility &&
                (() => {
                  const arr = permanents[t.at] || [];
                  const item = arr[t.index];
                  if (!item?.card) return null;
                  const carrierInstanceId =
                    item.instanceId ?? item.card.instanceId ?? null;
                  const isHp = isHyperparasite(item.card.name);

                  // Gather eligible minions on the same tile
                  const eligible: Array<{ name: string; index: number }> = [];
                  for (let i = 0; i < arr.length; i++) {
                    if (i === t.index) continue;
                    const p = arr[i];
                    if (!p.card) continue;
                    if (p.attachedTo) continue;
                    if (p.isCarried) continue;
                    const ct = (p.card.type || "").toLowerCase();
                    if (ct.includes("token")) continue;
                    if (!ct.includes("minion")) continue;
                    eligible.push({ name: p.card.name || "Minion", index: i });
                  }

                  // Gather eligible avatars on the same tile
                  const eligibleAvatars: Array<{
                    name: string;
                    seat: "p1" | "p2";
                  }> = [];
                  for (const seat of ["p1", "p2"] as const) {
                    const avatar = avatars[seat];
                    if (!avatar?.pos) continue;
                    const [ax, ay] = avatar.pos;
                    const avatarKey = toCellKey(ax, ay);
                    if (avatarKey !== t.at) continue;
                    if (avatar.carriedBy) continue;
                    eligibleAvatars.push({
                      name: avatar.card?.name || "Avatar",
                      seat,
                    });
                  }

                  // Gather currently carried units (for drop buttons)
                  const carried: Array<{ name: string; instanceId: string }> =
                    [];
                  for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];
                    if (!p.isCarried) continue;
                    if (
                      p.attachedTo?.at !== t.at ||
                      p.attachedTo?.index !== t.index
                    )
                      continue;
                    const pId = p.instanceId ?? p.card?.instanceId ?? null;
                    if (!pId) continue;
                    carried.push({
                      name: p.card?.name || "Minion",
                      instanceId: pId,
                    });
                  }

                  // Check for carried avatars
                  const carriedAvatars: Array<{
                    name: string;
                    seat: "p1" | "p2";
                  }> = [];
                  if (carrierInstanceId) {
                    for (const seat of ["p1", "p2"] as const) {
                      const avatar = avatars[seat];
                      if (avatar?.carriedBy?.instanceId === carrierInstanceId) {
                        carriedAvatars.push({
                          name: avatar.card?.name || "Avatar",
                          seat,
                        });
                      }
                    }
                  }

                  const buttons: React.ReactNode[] = [];

                  // Pick Up buttons for minions
                  for (const target of eligible) {
                    buttons.push(
                      <button
                        key={`carry-pick-${target.index}`}
                        className="w-full text-left rounded bg-green-600/30 hover:bg-green-600/50 px-3 py-1"
                        title={`Pick up ${target.name}`}
                        onClick={() => {
                          carryPickUp(t.at, t.index, target.index);
                          // Hyperparasite-specific: disable (tap) the carried unit
                          if (isHp) {
                            setTimeout(() => {
                              const state = useGameStore.getState();
                              const cellPerms = [
                                ...(state.permanents[t.at] || []),
                              ];
                              const carried2 = cellPerms[target.index];
                              if (carried2?.isCarried) {
                                cellPerms[target.index] = {
                                  ...carried2,
                                  tapped: true,
                                };
                                const permsNext = {
                                  ...state.permanents,
                                  [t.at]: cellPerms,
                                };
                                useGameStore.setState({
                                  permanents: permsNext,
                                } as Partial<typeof state> as typeof state);
                                state.trySendPatch({
                                  permanents: { [t.at]: cellPerms },
                                });
                              }
                            }, 0);
                          }
                          onClose();
                        }}
                      >
                        {`Pick Up ${target.name}`}
                      </button>,
                    );
                  }

                  // Pick Up buttons for avatars
                  for (const target of eligibleAvatars) {
                    buttons.push(
                      <button
                        key={`carry-pick-avatar-${target.seat}`}
                        className="w-full text-left rounded bg-green-600/30 hover:bg-green-600/50 px-3 py-1"
                        title={`Pick up ${target.name}`}
                        onClick={() => {
                          carryPickUpAvatar(t.at, t.index, target.seat);
                          onClose();
                        }}
                      >
                        {`Pick Up ${target.name}`}
                      </button>,
                    );
                  }

                  // Drop buttons for carried minions
                  for (const c of carried) {
                    buttons.push(
                      <button
                        key={`carry-drop-${c.instanceId}`}
                        className="w-full text-left rounded bg-yellow-600/30 hover:bg-yellow-600/50 px-3 py-1"
                        title={`Drop ${c.name}`}
                        onClick={() => {
                          if (!carrierInstanceId) return;
                          carryDrop(t.at, carrierInstanceId, c.instanceId);
                          // Hyperparasite-specific: re-enable (untap) the dropped unit
                          if (isHp) {
                            setTimeout(() => {
                              const state = useGameStore.getState();
                              const cellPerms = [
                                ...(state.permanents[t.at] || []),
                              ];
                              const droppedIdx = cellPerms.findIndex((p) => {
                                const pId =
                                  p.instanceId ?? p.card?.instanceId ?? null;
                                return pId === c.instanceId;
                              });
                              if (
                                droppedIdx !== -1 &&
                                cellPerms[droppedIdx].tapped
                              ) {
                                cellPerms[droppedIdx] = {
                                  ...cellPerms[droppedIdx],
                                  tapped: false,
                                };
                                const permsNext = {
                                  ...state.permanents,
                                  [t.at]: cellPerms,
                                };
                                useGameStore.setState({
                                  permanents: permsNext,
                                } as Partial<typeof state> as typeof state);
                                state.trySendPatch({
                                  permanents: { [t.at]: cellPerms },
                                });
                              }
                            }, 0);
                          }
                          onClose();
                        }}
                      >
                        {`Drop ${c.name}`}
                      </button>,
                    );
                  }

                  // Drop buttons for carried avatars
                  for (const c of carriedAvatars) {
                    buttons.push(
                      <button
                        key={`carry-drop-avatar-${c.seat}`}
                        className="w-full text-left rounded bg-yellow-600/30 hover:bg-yellow-600/50 px-3 py-1"
                        title={`Drop ${c.name}`}
                        onClick={() => {
                          if (!carrierInstanceId) return;
                          carryDropAvatar(carrierInstanceId);
                          onClose();
                        }}
                      >
                        {`Drop ${c.name}`}
                      </button>,
                    );
                  }

                  return buttons.length > 0 ? buttons : null;
                })()}

              {/* Gem token actions - Copy and Delete */}
              {t.kind === "gemToken" && (
                <>
                  <MenuBtn
                    icon="game-icons:big-diamond-ring"
                    label="Copy"
                    className="bg-cyan-900/30 hover:bg-cyan-900/50"
                    onClick={() => {
                      duplicateGemToken(t.tokenId);
                      onClose();
                    }}
                  />
                  <MenuBtn
                    icon="game-icons:cancel"
                    label="Delete"
                    className="bg-red-900/30 hover:bg-red-900/50"
                    onClick={() => {
                      destroyGemToken(t.tokenId);
                      onClose();
                    }}
                  />
                </>
              )}

              {/* Hand card actions - site cards: Play Site + Discard */}
              {t.kind === "handCard" &&
                (t.card.type || "").toLowerCase().includes("site") && (
                  <>
                    <MenuBtn
                      icon="game-icons:treasure-map"
                      label="Play Site"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        useGameStore.setState({ castPlacementMode: "surface" });
                        closeContextMenu();
                      }}
                    />
                    <MenuBtn
                      icon="game-icons:archive-register"
                      label="Move to Collection"
                      className="bg-purple-900/30 hover:bg-purple-900/50"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        moveCardFromHandToPile(t.who, "collection", "top");
                        closeContextMenu();
                      }}
                    />
                    <MenuBtn
                      icon="game-icons:broken-skull"
                      label="Discard"
                      className="bg-red-900/30 hover:bg-red-900/50"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        moveCardFromHandToPile(t.who, "graveyard", "top");
                        closeContextMenu();
                      }}
                    />
                  </>
                )}

              {/* Hand card actions - non-site cards: Cast + Cast Subsurface + Discard */}
              {t.kind === "handCard" &&
                !(t.card.type || "").toLowerCase().includes("site") && (
                  <>
                    <MenuBtn
                      icon="game-icons:sparkles"
                      label="Cast"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        useGameStore.setState({ castPlacementMode: "surface" });
                        closeContextMenu();
                      }}
                    />
                    <MenuBtn
                      icon="game-icons:layered-armor"
                      label="Cast Subsurface"
                      className="bg-amber-900/30 hover:bg-amber-900/50"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        setCastSubsurface(true);
                        useGameStore.setState({
                          castPlacementMode: "subsurface",
                        });
                        closeContextMenu();
                      }}
                    />
                    <MenuBtn
                      icon="game-icons:archive-register"
                      label="Move to Collection"
                      className="bg-purple-900/30 hover:bg-purple-900/50"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        moveCardFromHandToPile(t.who, "collection", "top");
                        closeContextMenu();
                      }}
                    />
                    <MenuBtn
                      icon="game-icons:broken-skull"
                      label="Discard"
                      className="bg-red-900/30 hover:bg-red-900/50"
                      onClick={() => {
                        selectHandCard(t.who, t.index);
                        moveCardFromHandToPile(t.who, "graveyard", "top");
                        closeContextMenu();
                      }}
                    />
                  </>
                )}

              {/* Ward - for sites with ward keyword */}
              {t.kind === "site" && siteHasWardAbility && (
                <MenuBtn
                  icon="game-icons:shield"
                  label="Ward"
                  className="bg-cyan-900/30 hover:bg-cyan-900/50"
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
                      }] gains Ward`,
                    );

                    try {
                      playCardFlip();
                    } catch {}
                    onClose();
                  }}
                />
              )}

              {/* Spawn minion tokens for sites with keywords (frog, foot soldier, skeleton, lance) */}
              {t.kind === "site" &&
                siteSpawnableTokens.length > 0 &&
                siteSpawnableTokens.map((tokenName) => {
                  const tokenDef = TOKEN_BY_NAME[tokenName];
                  if (!tokenDef) return null;
                  const label =
                    tokenDef.name.charAt(0).toUpperCase() +
                    tokenDef.name.slice(1);
                  return (
                    <MenuBtn
                      key={`spawn-${tokenName}`}
                      icon="game-icons:token"
                      label={`Spawn ${label}`}
                      className="bg-emerald-900/30 hover:bg-emerald-900/50"
                      onClick={() => {
                        const key = toCellKey(t.x, t.y);
                        const site = board.sites[key];
                        if (!site) {
                          onClose();
                          return;
                        }

                        const ownerNum = site.owner;
                        const ownerKey = seatFromOwner(ownerNum);
                        const instanceId = `${tokenDef.key.toLowerCase()}-${Date.now()}-${Math.random()
                          .toString(36)
                          .slice(2, 8)}`;

                        const tokenCard = {
                          cardId: newTokenInstanceId(tokenDef),
                          variantId: null,
                          name: tokenDef.name,
                          type: "Token",
                          slug: tokenSlug(tokenDef),
                          thresholds: null,
                          instanceId,
                        };

                        const tokenPermanent = {
                          owner: ownerNum,
                          card: tokenCard,
                          offset: null,
                          tilt: 0,
                          tapVersion: 0,
                          tapped: false,
                          version: 0,
                          instanceId,
                        };

                        const permanentsNext = { ...permanents };
                        const tileArr = [...(permanentsNext[key] || [])];
                        tileArr.push(tokenPermanent);
                        permanentsNext[key] = tileArr;

                        useGameStore.setState({ permanents: permanentsNext });

                        const state = useGameStore.getState();
                        if (state.transport) {
                          state.trySendPatch({ permanents: permanentsNext });
                        }

                        const playerNum = ownerKey === "p1" ? "1" : "2";
                        log(
                          `[p${playerNum}card:${
                            site.card?.name || "Site"
                          }] spawns ${tokenDef.name}`,
                        );

                        try {
                          playCardFlip();
                        } catch {}
                        onClose();
                      }}
                    />
                  );
                })}

              {/* Stealth - for permanents with stealth keyword */}
              {t.kind === "permanent" &&
                isMine &&
                hasStealthAbility &&
                (() => {
                  // Check if already has stealth token attached
                  const alreadyHasStealth = attachedTokens?.some(
                    (tk) => tk.name.toLowerCase() === "stealth",
                  );
                  return !alreadyHasStealth;
                })() && (
                  <MenuBtn
                    icon="game-icons:ghost"
                    label="Gain Stealth"
                    className="bg-violet-900/30 hover:bg-violet-900/50"
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
                        `[p${playerNum}card:${perm.card.name}] gains Stealth`,
                      );

                      try {
                        playCardFlip();
                      } catch {}
                      onClose();
                    }}
                  />
                )}

              {/* Ward - for permanents with ward keyword */}
              {t.kind === "permanent" &&
                isMine &&
                hasWardAbility &&
                (() => {
                  // Check if already has ward token attached
                  const alreadyHasWard = attachedTokens?.some(
                    (tk) => tk.name.toLowerCase() === "ward",
                  );
                  return !alreadyHasWard;
                })() && (
                  <MenuBtn
                    icon="game-icons:shield"
                    label="Ward"
                    className="bg-cyan-900/30 hover:bg-cyan-900/50"
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
                  />
                )}

              {/* Savior Ward - for minions that entered this turn when player has Savior avatar */}
              {t.kind === "permanent" &&
                (() => {
                  const arr = permanents[t.at] || [];
                  const item = arr[t.index];
                  if (!item) return false;

                  // Check if this is a minion
                  const permanentType = (item.card?.type || "").toLowerCase();
                  const isMinion = permanentType.includes("minion");
                  if (!isMinion) return false;

                  // Check if minion entered this turn
                  if (item.enteredOnTurn !== turn) return false;

                  // Check if the current player's avatar is Savior
                  const currentSeat = currentPlayer === 1 ? "p1" : "p2";
                  const myAvatar = avatars[currentSeat];
                  const maskedState = imposterMasks[currentSeat];
                  const effectiveAvatarName =
                    maskedState?.maskAvatar?.name ?? myAvatar?.card?.name;
                  if (!isSavior(effectiveAvatarName)) return false;

                  // Only show if it's my turn and I control the minion or it's on my side
                  const minionOwnerSeat = seatFromOwner(item.owner);
                  const isMyMinion = minionOwnerSeat === currentSeat;
                  if (!isMyMinion) return false;

                  return true;
                })() && (
                  <button
                    className={`w-full text-left rounded px-3 py-1 ${
                      (() => {
                        const arr = permanents[t.at] || [];
                        const attachedTokens = arr.filter(
                          (p) =>
                            p.attachedTo?.at === t.at &&
                            p.attachedTo?.index === t.index,
                        );
                        const alreadyHasWard = attachedTokens.some(
                          (tk) => tk.card.name.toLowerCase() === "ward",
                        );
                        return alreadyHasWard;
                      })()
                        ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
                        : "bg-cyan-900/30 hover:bg-cyan-900/50"
                    }`}
                    disabled={(() => {
                      const arr = permanents[t.at] || [];
                      const attachedTokens = arr.filter(
                        (p) =>
                          p.attachedTo?.at === t.at &&
                          p.attachedTo?.index === t.index,
                      );
                      const alreadyHasWard = attachedTokens.some(
                        (tk) => tk.card.name.toLowerCase() === "ward",
                      );
                      return alreadyHasWard;
                    })()}
                    onClick={() => {
                      const arr = permanents[t.at] || [];
                      const perm = arr[t.index];
                      if (!perm) {
                        onClose();
                        return;
                      }

                      // Check if already warded
                      const attachedTokens = arr.filter(
                        (p) =>
                          p.attachedTo?.at === t.at &&
                          p.attachedTo?.index === t.index,
                      );
                      const alreadyHasWard = attachedTokens.some(
                        (tk) => tk.card.name.toLowerCase() === "ward",
                      );
                      if (alreadyHasWard) {
                        log("This minion is already warded");
                        onClose();
                        return;
                      }

                      // Check and spend mana
                      const currentSeat = currentPlayer === 1 ? "p1" : "p2";
                      const availableMana = getAvailableMana(currentSeat);
                      if (availableMana < SAVIOR_WARD_COST) {
                        log(
                          `Not enough mana to ward (need ${SAVIOR_WARD_COST}, have ${availableMana})`,
                        );
                        // Don't block the action, just warn
                      }

                      // Spawn ward token and attach
                      const wardDef = TOKEN_BY_NAME["ward"];
                      if (!wardDef) {
                        log("Ward token definition not found");
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

                      // Add to permanents
                      const permanentsNext = { ...permanents };
                      const tileArr = [...(permanentsNext[t.at] || [])];
                      tileArr.push(wardPermanent);
                      permanentsNext[t.at] = tileArr;

                      // Spend mana (reduce available mana by increasing offset)
                      const playersNext = {
                        ...players,
                        [currentSeat]: {
                          ...players[currentSeat],
                          mana:
                            (players[currentSeat]?.mana || 0) -
                            SAVIOR_WARD_COST,
                        },
                      };

                      // Update store
                      useGameStore.setState({
                        permanents: permanentsNext,
                        players: playersNext,
                      });

                      // Send patch to server
                      const state = useGameStore.getState();
                      if (state.transport) {
                        state.trySendPatch({
                          permanents: permanentsNext,
                          players: {
                            [currentSeat]: playersNext[currentSeat],
                          } as typeof state.players,
                        });
                      }

                      const playerNum = ownerKey === "p1" ? "1" : "2";
                      log(
                        `[Savior] wards [p${playerNum}card:${perm.card.name}] for ${SAVIOR_WARD_COST} mana`,
                      );

                      try {
                        playCardFlip();
                      } catch {}
                      onClose();
                    }}
                  >
                    Ward ({SAVIOR_WARD_COST} mana)
                  </button>
                )}

              {/* Lance - for permanents with lance keyword */}
              {t.kind === "permanent" &&
                isMine &&
                hasLanceAbility &&
                (() => {
                  // Check if already has lance token attached
                  const alreadyHasLance = attachedTokens?.some(
                    (tk) => tk.name.toLowerCase() === "lance",
                  );
                  return !alreadyHasLance;
                })() && (
                  <MenuBtn
                    icon="game-icons:lightning-arc"
                    label="Lance"
                    className="bg-amber-900/30 hover:bg-amber-900/50"
                    onClick={() => {
                      // Spawn lance token and attach to this permanent
                      const lanceDef = TOKEN_BY_NAME["lance"];
                      if (!lanceDef) {
                        log("Lance token definition not found");
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
                      const instanceId = `lance-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`;

                      // Create lance token card
                      const lanceCard = {
                        cardId: newTokenInstanceId(lanceDef),
                        variantId: null,
                        name: lanceDef.name,
                        type: "Token",
                        slug: tokenSlug(lanceDef),
                        thresholds: null,
                        instanceId,
                      };

                      // Create the permanent item for the token
                      const lancePermanent = {
                        owner: ownerNum,
                        card: lanceCard,
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
                      tileArr.push(lancePermanent);
                      permanentsNext[t.at] = tileArr;

                      // Update store
                      useGameStore.setState({ permanents: permanentsNext });

                      // Send patch to server
                      const state = useGameStore.getState();
                      if (state.transport) {
                        state.trySendPatch({ permanents: permanentsNext });
                      }

                      const playerNum = ownerKey === "p1" ? "1" : "2";
                      log(`[p${playerNum}card:${perm.card.name}] gains Lance`);

                      try {
                        playCardFlip();
                      } catch {}
                      onClose();
                    }}
                  />
                )}

              {(doAttachToken || doDetachToken) && (
                <div className={iconMode ? "flex flex-wrap gap-1" : "space-y-2"}>
                  {doAttachToken && (
                    <MenuBtn
                      icon="game-icons:andromeda-chain"
                      label="Attach to unit"
                      onClick={doAttachToken}
                    />
                  )}
                  {doDetachToken && (
                    <MenuBtn
                      icon="game-icons:broken-shield"
                      label="Detach token"
                      onClick={doDetachToken}
                    />
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
                        // Check for special artifacts with activated abilities
                        const isToolbox = tokenName === "toolbox";
                        const isSilverBullet = tokenName === "silver bullet";
                        const hasActivatedAbility = isToolbox || isSilverBullet;

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

                        // Toolbox and Silver Bullet have activated abilities
                        if (hasActivatedAbility) {
                          const artifactType = isToolbox
                            ? "toolbox"
                            : "silver_bullet";
                          const rarityLabel = isToolbox
                            ? "Ordinary"
                            : "Exceptional";
                          const bearerKind: "permanent" | "avatar" =
                            t.kind === "avatar" ? "avatar" : "permanent";
                          const bearerName =
                            t.kind === "avatar"
                              ? avatars[t.who]?.card?.name || "Avatar"
                              : permanents[t.at]?.[t.index]?.card?.name ||
                                "Bearer";
                          const bearerInstanceId =
                            t.kind === "avatar"
                              ? null
                              : permanents[t.at]?.[t.index]?.instanceId || null;

                          // For Silver Bullet, check if bearer is already tapped
                          const bearerTapped =
                            t.kind === "avatar"
                              ? avatars[t.who]?.tapped
                              : permanents[t.at]?.[t.index]?.tapped;
                          const silverBulletDisabled =
                            isSilverBullet && bearerTapped;

                          return (
                            <div key={token.index} className="space-y-1">
                              <button
                                className={`w-full text-left rounded px-3 py-1 text-sm ${
                                  silverBulletDisabled
                                    ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
                                    : "bg-amber-900/30 hover:bg-amber-900/50"
                                }`}
                                disabled={silverBulletDisabled}
                                title={
                                  silverBulletDisabled
                                    ? "Bearer must be untapped to use Silver Bullet"
                                    : `Sacrifice ${token.name} to cast ${rarityLabel} spell from collection`
                                }
                                onClick={() => {
                                  if (silverBulletDisabled) return;
                                  const state = useGameStore.getState();
                                  const ownerSeat =
                                    t.kind === "avatar"
                                      ? t.who
                                      : seatFromOwner(
                                          permanents[t.at]?.[t.index]?.owner ||
                                            1,
                                        );
                                  state.beginArtifactCast({
                                    artifactType: artifactType as
                                      | "toolbox"
                                      | "silver_bullet",
                                    casterSeat: ownerSeat,
                                    artifact: {
                                      at: token.tileKey,
                                      index: token.index,
                                      instanceId:
                                        token.card?.instanceId || null,
                                      name: token.name,
                                    },
                                    bearer: {
                                      kind: bearerKind,
                                      at:
                                        t.kind === "avatar"
                                          ? toCellKey(
                                              avatars[t.who]?.pos?.[0] ?? 0,
                                              avatars[t.who]?.pos?.[1] ?? 0,
                                            )
                                          : t.at,
                                      index: t.kind === "avatar" ? -1 : t.index,
                                      instanceId: bearerInstanceId,
                                      name: bearerName,
                                    },
                                  });
                                  onClose();
                                }}
                              >
                                Use {token.name} ({rarityLabel})
                              </button>
                              <button
                                className="w-full text-left rounded bg-purple-900/20 hover:bg-purple-900/40 px-3 py-1 text-sm"
                                onClick={() => {
                                  detachToken(token.tileKey, token.index);
                                  onClose();
                                }}
                              >
                                Drop {token.name}
                              </button>
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
                                  "banished",
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
                                    item.card.name.toLowerCase() === tokenName,
                                );
                                if (detachedToken) {
                                  const tokenIndex =
                                    items.indexOf(detachedToken);
                                  if (tokenIndex >= 0) {
                                    movePermanentToZone(
                                      token.tileKey,
                                      tokenIndex,
                                      "banished",
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
                  // Prioritize instanceId (unique per card), fallback to position only if no instanceId
                  const pithImpEntry = pithImpHands.find(
                    (p) =>
                      (item?.instanceId &&
                        p.minion.instanceId === item.instanceId) ||
                      (!item?.instanceId && p.minion.at === t.at),
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
                <MenuBtn
                  icon={hasCounter ? "game-icons:heart-minus" : "game-icons:heart-plus"}
                  label={hasCounter ? "Remove counter" : "Add counter"}
                  onClick={doToggleCounter}
                />
              )}

              {/* Burrow/Submerge Actions */}
              {(positionActions.length > 0 ||
                (Array.isArray(extraActions) && extraActions.length > 0)) && (
                <div className={iconMode ? "flex flex-wrap gap-1" : "space-y-2"}>
                  {positionActions.concat(extraActions).map((action) => {
                    const isAttackHere = action.actionId === "__attack_here__";
                    const isAttackAdj =
                      action.actionId.startsWith("__attack_adj_");
                    if (isAttackHere) {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:crossed-swords"
                          label={action.displayText}
                          title={action.description}
                          className="bg-emerald-600/20 hover:bg-emerald-600/30"
                          onClick={() => {
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
                        />
                      );
                    }
                    if (isAttackAdj) {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:crosshair"
                          label={action.displayText}
                          title={action.description}
                          className="bg-emerald-600/20 hover:bg-emerald-600/30"
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
                        />
                      );
                    }
                    // Avatar attack here action
                    if (action.actionId === "__avatar_attack_here__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:crossed-swords"
                          label={action.displayText}
                          title={action.description}
                          className="bg-emerald-600/20 hover:bg-emerald-600/30"
                          onClick={() => {
                            if (t.kind === "avatar") {
                              const avatar = avatars[t.who];
                              if (
                                avatar &&
                                Array.isArray(avatar.pos) &&
                                avatar.pos.length === 2
                              ) {
                                const [avX, avY] = avatar.pos;
                                const avatarOwner: 1 | 2 =
                                  t.who === "p1" ? 1 : 2;
                                setAttackTargetChoice({
                                  tile: { x: avX, y: avY },
                                  attacker: {
                                    at: toCellKey(avX, avY),
                                    index: -1,
                                    instanceId: null,
                                    owner: avatarOwner,
                                    isAvatar: true,
                                    avatarSeat: t.who,
                                  },
                                  candidates: [],
                                });
                              }
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Switch Site Position action
                    if (action.actionId === "__switch_site_position__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:swap-bag"
                          label={action.displayText}
                          title={action.description}
                          className="bg-amber-600/20 hover:bg-amber-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              setSwitchSiteSource({ x: t.x, y: t.y });
                              log("Click target tile to swap/move site.");
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Flood site action - place Flooded token on site
                    if (action.actionId === "__flood_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:water-drop"
                          label={action.displayText}
                          title={action.description}
                          className="bg-cyan-600/20 hover:bg-cyan-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              floodSite(t.x, t.y);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Disable site action - place Disabled token on site
                    if (action.actionId === "__disable_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:power-button"
                          label={action.displayText}
                          title={action.description}
                          className="bg-violet-600/20 hover:bg-violet-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              disableSite(t.x, t.y);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Silence site action - place Silenced token on site (textbox only)
                    if (action.actionId === "__silence_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:mute"
                          label={action.displayText}
                          title={action.description}
                          className="bg-purple-600/20 hover:bg-purple-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              silenceSite(t.x, t.y);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Unsilence site action - remove Silenced token from site
                    if (action.actionId === "__unsilence_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:mute"
                          label={action.displayText}
                          title={action.description}
                          className="bg-purple-600/20 hover:bg-purple-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              const key = toCellKey(t.x, t.y);
                              const perms = permanents[key] || [];
                              const tokenIdx = perms.findIndex(
                                (p) =>
                                  (p.card?.name || "").toLowerCase() ===
                                  "silenced",
                              );
                              if (tokenIdx >= 0) {
                                movePermanentToZone(key, tokenIdx, "banished");
                                try {
                                  playCardFlip();
                                } catch {}
                              }
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Undisable site action - remove Disabled token from site
                    if (action.actionId === "__undisable_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:power-button"
                          label={action.displayText}
                          title={action.description}
                          className="bg-violet-600/20 hover:bg-violet-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              const key = toCellKey(t.x, t.y);
                              const perms = permanents[key] || [];
                              const tokenIdx = perms.findIndex(
                                (p) =>
                                  (p.card?.name || "").toLowerCase() ===
                                  "disabled",
                              );
                              if (tokenIdx >= 0) {
                                movePermanentToZone(key, tokenIdx, "banished");
                                try {
                                  playCardFlip();
                                } catch {}
                              }
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Annual Fair activated ability - pay 1 mana, choose element threshold
                    if (action.actionId === "__annual_fair_activate__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:calendar"
                          label={action.displayText}
                          title={action.description}
                          className="bg-amber-600/20 hover:bg-amber-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              const key = toCellKey(t.x, t.y);
                              const site = board.sites[key];
                              const ownerSeat = site
                                ? seatFromOwner(site.owner)
                                : "p1";
                              beginAnnualFair(key, ownerSeat);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Transform site into minion (Island Leviathan, Horns of Behemoth)
                    if (action.actionId === "__transform_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:magic-broom"
                          label={action.displayText}
                          title={action.description}
                          className="bg-red-600/20 hover:bg-red-600/30"
                          onClick={() => {
                            if (t.kind === "site") {
                              transformSite(t.x, t.y);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Silence permanent action - place Silenced token on aura/minion/artifact
                    if (action.actionId === "__silence_permanent__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:mute"
                          label={action.displayText}
                          title={action.description}
                          className="bg-violet-600/20 hover:bg-violet-600/30"
                          onClick={() => {
                            if (t.kind === "permanent") {
                              silencePermanent(t.at, t.index);
                              try {
                                playCardFlip();
                              } catch {}
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Piracy action (Captain Baldassare / Sea Raider)
                    if (action.actionId === "__piracy_trigger__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:anchor"
                          label={action.displayText}
                          title={action.description}
                          className="bg-cyan-600/20 hover:bg-cyan-600/30"
                          onClick={() => {
                            if (t.kind === "permanent") {
                              const itm = (permanents[t.at] || [])[t.index];
                              if (itm) {
                                const ownerSeat = seatFromOwner(itm.owner);
                                const cardName = (
                                  itm.card?.name || ""
                                ).toLowerCase();
                                const count =
                                  cardName === "captain baldassare" ? 3 : 1;
                                triggerPiracy({
                                  source: {
                                    at: t.at,
                                    index: t.index,
                                    instanceId: itm.instanceId ?? null,
                                    owner: itm.owner as 1 | 2,
                                    card: itm.card,
                                  },
                                  attackerSeat: ownerSeat,
                                  discardCount: count,
                                });
                              }
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Imposter unmask action
                    if (action.actionId === "__unmask__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:sunglasses"
                          label={action.displayText}
                          title={action.description}
                          className="bg-purple-600/20 hover:bg-purple-600/30"
                          onClick={() => {
                            if (t.kind === "avatar") {
                              unmask(t.who);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Imposter mask action - opens collection search for avatar selection
                    if (action.actionId === "__imposter_mask__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:sunglasses"
                          label={action.displayText}
                          title={action.description}
                          className="bg-purple-600/20 hover:bg-purple-600/30"
                          onClick={() => {
                            if (t.kind === "avatar") {
                              window.dispatchEvent(
                                new CustomEvent("imposter:openMaskDialog", {
                                  detail: { seat: t.who },
                                }),
                              );
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Necromancer summon skeleton action
                    if (action.actionId === "__summon_skeleton__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:bone-gnawer"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-emerald-600/20 hover:bg-emerald-600/30"
                              : "bg-gray-600/20"
                          }
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              summonSkeletonHere(t.who);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Mephistopheles summon Evil minion action
                    if (action.actionId === "__mephistopheles_summon__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:ghost"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-red-600/20 hover:bg-red-600/30"
                              : "bg-gray-600/20"
                          }
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              beginMephistophelesSummon(t.who);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Pathfinder play site action
                    if (action.actionId === "__pathfinder_play__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:compass"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-emerald-600/20 hover:bg-emerald-600/30"
                              : "bg-gray-600/20"
                          }
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              beginPathfinderPlay(t.who);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Geomancer replace rubble action
                    if (action.actionId === "__geomancer_rubble__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:mountains"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-amber-600/20 hover:bg-amber-600/30"
                              : "bg-gray-600/20"
                          }
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              beginGeomancerRubble(t.who);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Druid flip action
                    if (action.actionId === "__flip_druid__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:cycle"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-amber-600/20 hover:bg-amber-600/30"
                              : "bg-gray-600/20"
                          }
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              flipDruid(t.who);
                            }
                            onClose();
                          }}
                        />
                      );
                    }
                    // Tap to draw site action (standard avatar ability)
                    if (action.actionId === "__tap_draw_site__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:treasure-map"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-teal-600/20 hover:bg-teal-600/30"
                              : "bg-gray-600/20"
                          }
                          onClick={() => {
                            if (t.kind === "avatar" && action.isEnabled) {
                              toggleTapAvatar(t.who);
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
                        />
                      );
                    }
                    // Frontier Settlers tap ability
                    if (action.actionId === "__frontier_settlers_ability__") {
                      return (
                        <MenuBtn
                          key={action.actionId}
                          icon="game-icons:house"
                          label={action.displayText}
                          title={action.description}
                          disabled={!action.isEnabled}
                          className={
                            action.isEnabled
                              ? "bg-green-600/20 hover:bg-green-600/30"
                              : "bg-gray-600/20"
                          }
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
                        />
                      );
                    }
                    // Default: position state actions (burrow/submerge)
                    return (
                      <MenuBtn
                        key={action.actionId}
                        icon={
                          action.icon === "arrow-down"
                            ? "game-icons:falling"
                            : action.icon === "arrow-up"
                              ? "game-icons:uprising"
                              : "game-icons:water-splash"
                        }
                        label={action.displayText}
                        title={action.description}
                        disabled={!action.isEnabled}
                        className={
                          action.isEnabled
                            ? "bg-blue-600/20 hover:bg-blue-600/30"
                            : "bg-gray-600/20"
                        }
                        onClick={() => {
                          if (action.isEnabled && action.newPositionState) {
                            updatePermanentState(
                              action.targetPermanentId,
                              action.newPositionState,
                            );
                            log(
                              `${header} ${action.displayText.toLowerCase()}ed`,
                            );
                            onClose();
                          }
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {(doToHand || doToGY || doToSpellbook || doBanish) && (
                <div className={iconMode ? "flex flex-wrap gap-1" : "space-y-2"}>
                  {doToHand && (
                    <MenuBtn
                      icon="game-icons:hand"
                      label="Move to Hand"
                      onClick={doToHand}
                    />
                  )}
                  {doToGY && (
                    <MenuBtn
                      icon="game-icons:broken-skull"
                      label="Move to Cemetery"
                      onClick={doToGY}
                    />
                  )}
                  {doToSpellbook && (
                    <MenuBtn
                      icon="game-icons:spell-book"
                      label="Move to Spellbook"
                      onClick={doToSpellbook}
                    />
                  )}
                  {doAddToAtlas && (
                    <MenuBtn
                      icon="game-icons:treasure-map"
                      label="Move to Atlas"
                      onClick={doAddToAtlas}
                    />
                  )}
                  {doBanish && (
                    <MenuBtn
                      icon="game-icons:fire-zone"
                      label="Banish Card"
                      onClick={doBanish}
                    />
                  )}
                </div>
              )}

              {(doDrawFromPile ||
                doDrawFromPileBottom ||
                doShufflePile ||
                doSearchPile) && (
                <div className={iconMode ? "flex flex-wrap gap-1" : "space-y-2"}>
                  {doDrawFromPile && (
                    <MenuBtn
                      icon="game-icons:uprising"
                      label="Draw top"
                      onClick={doDrawFromPile}
                    />
                  )}
                  {doDrawFromPileBottom && (
                    <MenuBtn
                      icon="game-icons:falling"
                      label="Draw from bottom"
                      onClick={doDrawFromPileBottom}
                    />
                  )}
                  {doSearchPile && (
                    <MenuBtn
                      icon="game-icons:magnifying-glass"
                      label="Search pile"
                      onClick={doSearchPile}
                    />
                  )}
                  {doShufflePile && (
                    <MenuBtn
                      icon="game-icons:card-random"
                      label="Shuffle"
                      onClick={doShufflePile}
                    />
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
