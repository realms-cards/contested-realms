import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { AtlanteanFateAura, CellKey, GameState } from "./types";
import { parseCellKey, toCellKey, getCellNumber } from "./utils/boardHelpers";

function newAtlanteanFateId() {
  return `af_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Calculate the nearest valid intersection for aura placement.
 * Intersections are at corners where 4 tiles meet.
 * Returns the anchor tile (upper-right of the intersection) and offset to position card at intersection.
 *
 * @param worldX - World X coordinate of drop
 * @param worldZ - World Z coordinate of drop
 * @param offsetX - Board X offset
 * @param offsetZ - Board Z offset (typically offsetY in calling code)
 * @param tileSize - Size of each tile
 * @param boardWidth - Number of tiles wide
 * @param boardHeight - Number of tiles tall
 * @returns { anchorTile, intersectionOffset, isValid } or null if no valid intersection nearby
 */
export function snapToIntersection(
  worldX: number,
  worldZ: number,
  offsetX: number,
  offsetZ: number,
  tileSize: number,
  boardWidth: number,
  boardHeight: number,
): {
  anchorTileX: number;
  anchorTileY: number;
  intersectionOffsetX: number;
  intersectionOffsetZ: number;
  isValid: boolean;
} | null {
  // Convert world position to relative board position
  const relX = worldX - offsetX;
  const relZ = worldZ - offsetZ;

  // Find nearest intersection
  // Intersections are at tile corners (where 4 tiles meet)
  // Intersection (ix, iy) is at world position (offsetX + ix * tileSize, offsetZ + iy * tileSize)
  // The anchor tile for intersection (ix, iy) is tile (ix-1, iy-1) - the lower-left of the 4 tiles

  // Calculate intersection index (1-indexed, so intersection 1,1 is at corner of tiles 0,0 to 1,1)
  // Intersection ix is at position ix * tileSize, so ix = round(relX / tileSize)
  const ix = Math.round(relX / tileSize);
  const iy = Math.round(relZ / tileSize);

  // Validate: intersection must have all 4 tiles on board
  // Tiles around intersection (ix, iy): (ix-1, iy-1), (ix, iy-1), (ix-1, iy), (ix, iy)
  // Need: ix-1 >= 0, ix <= boardWidth-1, iy-1 >= 0, iy <= boardHeight-1
  // Simplified: ix >= 1, ix <= boardWidth, iy >= 1, iy <= boardHeight
  // But since tiles are 0-indexed: need ix-1 >= 0 && ix-1 < boardWidth && ix >= 0 && ix < boardWidth
  // So: ix >= 1 && ix <= boardWidth-1+1 = boardWidth... wait let me think again

  // Tiles are indexed 0 to boardWidth-1 and 0 to boardHeight-1
  // For intersection (ix, iy), affected tiles are:
  // (ix-1, iy-1), (ix, iy-1), (ix-1, iy), (ix, iy)
  // All must be valid:
  // ix-1 >= 0 && ix-1 < boardWidth => ix >= 1 && ix <= boardWidth
  // ix >= 0 && ix < boardWidth => ix >= 0 && ix <= boardWidth-1
  // Combined: ix >= 1 && ix <= boardWidth-1... no that's wrong
  // Let's be explicit:
  // For tile (ix-1, *) to exist: ix-1 >= 0 => ix >= 1
  // For tile (ix, *) to exist: ix < boardWidth => ix <= boardWidth-1
  // So: ix >= 1 && ix <= boardWidth-1 is too restrictive
  // Actually ix can equal boardWidth-1+1 = boardWidth? No, tile ix must exist so ix < boardWidth
  // So valid range: 1 <= ix <= boardWidth-1? No...

  // Let me reconsider. boardWidth = 5 means tiles 0,1,2,3,4
  // Valid intersections have tiles (ix-1) and (ix) both in range [0, 4]
  // ix-1 >= 0 => ix >= 1
  // ix <= 4 => ix <= 4
  // So ix in [1, 4] = [1, boardWidth-1]
  // Similarly iy in [1, boardHeight-1]

  const isValid =
    ix >= 1 && ix <= boardWidth - 1 && iy >= 1 && iy <= boardHeight - 1;

  if (!isValid) {
    // Try to clamp to nearest valid intersection
    const clampedIx = Math.max(1, Math.min(boardWidth - 1, ix));
    const clampedIy = Math.max(1, Math.min(boardHeight - 1, iy));

    // Use clamped intersection
    const anchorTileX = clampedIx - 1; // Lower-left tile of 2x2
    const anchorTileY = clampedIy - 1;

    // Intersection world position (corner where 4 tiles meet)
    const intersectionWorldX = offsetX + clampedIx * tileSize;
    const intersectionWorldZ = offsetZ + clampedIy * tileSize;

    // Offset from anchor tile center to intersection
    // Tile center is at (tileX + 0.5) * tileSize from board origin
    const anchorCenterX = offsetX + (anchorTileX + 0.5) * tileSize;
    const anchorCenterZ = offsetZ + (anchorTileY + 0.5) * tileSize;
    const intersectionOffsetX = intersectionWorldX - anchorCenterX;
    const intersectionOffsetZ = intersectionWorldZ - anchorCenterZ;

    return {
      anchorTileX,
      anchorTileY,
      intersectionOffsetX,
      intersectionOffsetZ,
      isValid: true, // Clamped to valid
    };
  }

  // Use the calculated intersection
  const anchorTileX = ix - 1; // Lower-left tile of 2x2
  const anchorTileY = iy - 1;

  // Intersection world position (corner where 4 tiles meet)
  const intersectionWorldX = offsetX + ix * tileSize;
  const intersectionWorldZ = offsetZ + iy * tileSize;

  // Offset from anchor tile center to intersection
  // Tile center is at (tileX + 0.5) * tileSize from board origin
  const anchorCenterX = offsetX + (anchorTileX + 0.5) * tileSize;
  const anchorCenterZ = offsetZ + (anchorTileY + 0.5) * tileSize;
  const intersectionOffsetX = intersectionWorldX - anchorCenterX;
  const intersectionOffsetZ = intersectionWorldZ - anchorCenterZ;

  return {
    anchorTileX,
    anchorTileY,
    intersectionOffsetX,
    intersectionOffsetZ,
    isValid: true,
  };
}

/**
 * Border auras that are placed on the border between two squares,
 * not at a 2x2 intersection. These should NOT use intersection snapping.
 */
const BORDER_AURA_NAMES = new Set([
  "wall of ice",
  "wall of brambles",
  "great wall",
  "perilous bridge",
]);

/**
 * Single-site auras that are conjured atop a specific site or void square,
 * not at a 2x2 intersection. These should NOT use intersection snapping.
 */
const SINGLE_SITE_AURA_NAMES = new Set([
  "salt the earth",
  "sow the earth",
  "hamlet's ablaze!",
  "castle's ablaze!",
]);

/**
 * Check if a card is a 2x2 area Aura (uses intersection snapping).
 * Excludes border auras and single-site auras.
 */
export function isAuraSubtype(
  subTypes: string | null | undefined,
  cardName?: string | null,
): boolean {
  if (!subTypes) return false;
  if (!subTypes.toLowerCase().includes("aura")) return false;

  if (cardName) {
    const nameLower = cardName.toLowerCase();
    // Exclude border auras - placed on edge between two squares
    if (BORDER_AURA_NAMES.has(nameLower)) return false;
    // Exclude single-site auras - placed on a specific site/void
    if (SINGLE_SITE_AURA_NAMES.has(nameLower)) return false;
  }

  return true;
}

/**
 * Complete list of Ordinary rarity sites from cards_raw.json.
 * Used as fallback when rarity data isn't available on CardRef or metaByCardId.
 */
const ORDINARY_SITE_NAMES = new Set([
  "accursed desert",
  "accursed tower",
  "algae bloom",
  "arid desert",
  "autumn bloom",
  "autumn river",
  "blessed village",
  "blessed well",
  "bog",
  "bonfire",
  "common village",
  "croaking swamp",
  "dark tower",
  "den of evil",
  "desert bloom",
  "forge",
  "gothic tower",
  "hamlet",
  "hillside chapel",
  "humble village",
  "hunter's lodge",
  "leadworks",
  "leyline henge",
  "lone tower",
  "lookout",
  "open grave",
  "open mausoleum",
  "pond",
  "red desert",
  "remote desert",
  "rubble",
  "rustic village",
  "silent hills",
  "simple village",
  "spire",
  "spore spouts",
  "spring river",
  "stinging kelp",
  "stream",
  "summer river",
  "treetop hideout",
  "troubled town",
  "twilight bloom",
  "valley",
  "vast desert",
  "wasteland",
  "winter river",
]);

/**
 * Check if a site is "ordinary" (basic elemental site that just provides mana/threshold).
 * In Sorcery TCG, "Ordinary" is a rarity for basic sites.
 * Non-ordinary sites have special abilities and get flooded by Atlantean Fate.
 *
 * This checks rarity first, then falls back to the known ordinary sites list.
 */
export function isOrdinarySite(
  siteName: string | null | undefined,
  siteRarity?: string | null,
): boolean {
  // Check rarity first - "Ordinary" rarity sites are ordinary
  if (siteRarity) {
    const rarityLc = siteRarity.toLowerCase().trim();
    if (rarityLc === "ordinary") return true;
    // If we have a non-ordinary rarity, return false immediately
    if (
      rarityLc === "exceptional" ||
      rarityLc === "elite" ||
      rarityLc === "unique"
    ) {
      return false;
    }
  }

  // Fallback: check against known ordinary site names from cards_raw.json
  if (siteName) {
    const nameLc = siteName.toLowerCase().trim();
    if (ORDINARY_SITE_NAMES.has(nameLc)) return true;
  }

  return false;
}

/**
 * Calculate the 2x2 area the aura occupies.
 * Per rules: "aura is cast at the intersection of four squares"
 * The card is placed at the anchor tile (lower-left of 2x2) with offset to intersection.
 * The 4 tiles around the intersection:
 * - (x, y) lower-left (anchor tile)
 * - (x+1, y) lower-right
 * - (x, y+1) upper-left
 * - (x+1, y+1) upper-right
 */
export function calculate2x2Area(
  cardX: number,
  cardY: number,
  boardWidth: number,
  boardHeight: number,
): CellKey[] {
  const cells: CellKey[] = [];
  // Anchor tile is lower-left of 2x2 - affected tiles extend up and right
  const offsets = [
    { dx: 0, dy: 0 }, // lower-left (anchor tile)
    { dx: 1, dy: 0 }, // lower-right
    { dx: 0, dy: 1 }, // upper-left
    { dx: 1, dy: 1 }, // upper-right
  ];
  for (const { dx, dy } of offsets) {
    const x = cardX + dx;
    const y = cardY + dy;
    // Check bounds
    if (x >= 0 && x < boardWidth && y >= 0 && y < boardHeight) {
      cells.push(toCellKey(x, y));
    }
  }
  return cells;
}

/**
 * Calculate the 2x2 area based on tile position and offset.
 * The offset determines which corner/intersection the card is at:
 * - offX >= 0, offZ >= 0: bottom-right corner of tile → affects (x, y), (x+1, y), (x, y+1), (x+1, y+1)
 * - offX < 0, offZ >= 0: bottom-left corner → affects (x-1, y), (x, y), (x-1, y+1), (x, y+1)
 * - offX >= 0, offZ < 0: top-right corner → affects (x, y-1), (x+1, y-1), (x, y), (x+1, y)
 * - offX < 0, offZ < 0: top-left corner → affects (x-1, y-1), (x, y-1), (x-1, y), (x, y)
 */
export function calculate2x2AreaWithOffset(
  tileX: number,
  tileY: number,
  offX: number,
  offZ: number,
  boardWidth: number,
  boardHeight: number,
): CellKey[] {
  // Determine anchor tile based on which quadrant the offset is in
  const anchorX = offX >= 0 ? tileX : tileX - 1;
  const anchorY = offZ >= 0 ? tileY : tileY - 1;

  const cells: CellKey[] = [];
  const offsets = [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
  ];
  for (const { dx, dy } of offsets) {
    const x = anchorX + dx;
    const y = anchorY + dy;
    if (x >= 0 && x < boardWidth && y >= 0 && y < boardHeight) {
      cells.push(toCellKey(x, y));
    }
  }
  return cells;
}

/**
 * Check if an anchor tile position allows a valid 2x2 area.
 * An aura MUST affect exactly 4 tiles - it cannot be placed at edges.
 * The anchor tile is the lower-left of the 2x2 area.
 * Required tiles: (x, y), (x+1, y), (x, y+1), (x+1, y+1)
 */
export function isValidCornerPosition(
  anchorX: number,
  anchorY: number,
  boardWidth: number,
  boardHeight: number,
): boolean {
  // Check that all 4 tiles in the 2x2 area exist
  // Anchor is lower-left, tiles extend up and right
  // Required tiles:
  // - (anchorX, anchorY) lower-left - needs x >= 0, y >= 0
  // - (anchorX+1, anchorY) lower-right - needs x+1 < boardWidth
  // - (anchorX, anchorY+1) upper-left - needs y+1 < boardHeight
  // - (anchorX+1, anchorY+1) upper-right - needs both

  if (anchorX < 0) return false;
  if (anchorY < 0) return false;
  if (anchorX + 1 >= boardWidth) return false; // Need tile to the right
  if (anchorY + 1 >= boardHeight) return false; // Need tile above

  return true;
}

export type AtlanteanFateSlice = Pick<
  GameState,
  | "pendingAtlanteanFate"
  | "beginAtlanteanFate"
  | "setAtlanteanFatePreview"
  | "selectAtlanteanFateCorner"
  | "resolveAtlanteanFate"
  | "replaceAtlanteanFate"
  | "cancelAtlanteanFate"
  | "isSiteFlooded"
  | "removeAtlanteanFateAura"
>;

export const createAtlanteanFateSlice: StateCreator<
  GameState,
  [],
  [],
  AtlanteanFateSlice
> = (set, get) => ({
  pendingAtlanteanFate: null,

  beginAtlanteanFate: (input) => {
    const id = newAtlanteanFateId();
    const casterSeat = input.casterSeat;
    // The spell's position determines the intersection - 4 tiles around where the card is placed
    const selectedCorner = input.spell.at;
    const board = get().board;
    const { x, y } = parseCellKey(selectedCorner);

    // Validate that the aura can affect exactly 4 tiles (not at edge)
    if (!isValidCornerPosition(x, y, board.size.w, board.size.h)) {
      get().log(
        `⚠️ Atlantean Fate must be placed at an intersection of 4 tiles, not at the edge of the board`,
      );
      // Don't start the flow if invalid position
      return;
    }

    set({
      pendingAtlanteanFate: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "confirming", // Go directly to confirming - card placement determines the area
        previewCorner: selectedCorner,
        selectedCorner,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "atlanteanFateBegin",
          id,
          spell: input.spell,
          casterSeat,
          selectedCorner,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Atlantean Fate - confirm to apply flood effects`,
    );
  },

  setAtlanteanFatePreview: (cornerCell) => {
    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.phase !== "selectingCorner") return;

    set({
      pendingAtlanteanFate: {
        ...pending,
        previewCorner: cornerCell,
      },
    } as Partial<GameState> as GameState);

    // Broadcast preview to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "atlanteanFatePreview",
          id: pending.id,
          cornerCell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectAtlanteanFateCorner: (cornerCell) => {
    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.phase !== "selectingCorner") return;

    const board = get().board;
    const { x, y } = parseCellKey(cornerCell);

    if (!isValidCornerPosition(x, y, board.size.w, board.size.h)) {
      get().log("Invalid corner position for Atlantean Fate area");
      return;
    }

    set({
      pendingAtlanteanFate: {
        ...pending,
        selectedCorner: cornerCell,
        phase: "confirming",
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "atlanteanFateSelect",
          id: pending.id,
          cornerCell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const cellNo = getCellNumber(x, y, board.size.w);
    get().log(
      `Selected corner #${cellNo} for Atlantean Fate - click Confirm to place`,
    );
  },

  resolveAtlanteanFate: () => {
    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.phase !== "confirming" || !pending.selectedCorner)
      return;

    const board = get().board;
    const permanents = get().permanents;
    const { x: cornerX, y: cornerY } = parseCellKey(pending.selectedCorner);

    // Calculate the 2x2 area
    const coveredCells = calculate2x2Area(
      cornerX,
      cornerY,
      board.size.w,
      board.size.h,
    );

    // Find non-ordinary sites to flood
    // Ordinary sites (basic elemental sites with "Ordinary" rarity) are NOT flooded
    const metaByCardId = get().metaByCardId as Record<
      number,
      { rarity?: string }
    >;
    const floodedSites: CellKey[] = [];
    for (const cellKey of coveredCells) {
      const site = board.sites[cellKey];
      if (site && site.card) {
        const siteName = site.card.name;
        const cardId = (site.card as { cardId?: number }).cardId;
        // Try CardRef rarity first, then fall back to metaByCardId cache
        let siteRarity = (site.card as { rarity?: string }).rarity;
        if (!siteRarity && cardId && metaByCardId[cardId]) {
          siteRarity = metaByCardId[cardId].rarity;
        }
        const isOrdinary = isOrdinarySite(siteName, siteRarity);
        console.log(
          `[AtlanteanFate] Site ${cellKey}: name="${siteName}", cardId=${cardId}, rarity="${siteRarity}", isOrdinary=${isOrdinary}`,
        );
        if (!isOrdinary) {
          floodedSites.push(cellKey);
        }
      }
    }
    console.log(`[AtlanteanFate] Flooded sites: ${floodedSites.join(", ")}`);
    console.log(`[AtlanteanFate] Covered cells: ${coveredCells.join(", ")}`);

    // Process minions and artifacts on flooded sites:
    // Per Atlantean Fate card text: "Genesis → Submerge all minions and artifacts atop affected sites."
    // ALL minions and artifacts get submerged (not just those with the submerge keyword)
    const toSubmergeState: Array<{
      cellKey: CellKey;
      index: number;
      instanceId: string;
      cardName: string;
    }> = [];

    for (const cellKey of floodedSites) {
      const cellPermanents = permanents[cellKey] || [];
      for (let i = 0; i < cellPermanents.length; i++) {
        const perm = cellPermanents[i];
        const cardType = (perm.card?.type || "").toLowerCase();
        const cardName = perm.card?.name || "";
        const instanceId = perm.instanceId || perm.card?.instanceId || "";

        // Submerge all minions and artifacts (per card rules text)
        if (cardType.includes("minion") || cardType.includes("artifact")) {
          if (instanceId) {
            toSubmergeState.push({ cellKey, index: i, instanceId, cardName });
          }
        }
      }
    }

    // Put all minions and artifacts into submerged state
    // Must initialize position first, then set ability, then update state (same as toolbox)
    let submergedCount = 0;
    for (const item of toSubmergeState) {
      try {
        // 1. Register ability so the permanent can be in submerged state
        get().setPermanentAbility(item.instanceId, {
          permanentId: item.instanceId,
          canBurrow: false,
          canSubmerge: true,
          requiresWaterSite: false, // Forced submerge by Atlantean Fate
          abilitySource: `${item.cardName} - Submerged (Atlantean Fate)`,
        });
        // 2. Initialize position if not exists (required for visual state)
        if (!get().permanentPositions[item.instanceId]) {
          get().setPermanentPosition(item.instanceId, {
            permanentId: item.instanceId,
            state: "surface",
            position: { x: 0, y: 0, z: 0 },
          });
        }
        // 3. Update to submerged state
        get().updatePermanentState(item.instanceId, "submerged");
        submergedCount++;
        console.log(
          `[AtlanteanFate] Submerged ${item.cardName} at ${item.cellKey}`,
        );
      } catch (e) {
        console.warn("Failed to submerge permanent:", e);
      }
    }

    // Place Flooded tokens on non-ordinary sites
    for (const cellKey of floodedSites) {
      const { x, y } = parseCellKey(cellKey);
      try {
        get().floodSite(x, y);
      } catch (e) {
        console.warn("Failed to place flood token:", e);
      }
    }

    // Create the aura
    const aura: AtlanteanFateAura = {
      id: pending.id,
      cornerCell: pending.selectedCorner,
      coveredCells,
      owner: pending.spell.owner,
      ownerSeat: pending.casterSeat,
      floodedSites,
      permanentAt: pending.spell.at,
      permanentIndex: pending.spell.index,
      createdAt: Date.now(),
    };

    // Update special site state with the new aura
    const currentState = get().specialSiteState;
    const newAuras = [...currentState.atlanteanFateAuras, aura];

    set({
      specialSiteState: {
        ...currentState,
        atlanteanFateAuras: newAuras,
      },
      pendingAtlanteanFate: null,
    } as Partial<GameState> as GameState);

    // Send patch for sync
    get().trySendPatch({
      specialSiteState: {
        ...currentState,
        atlanteanFateAuras: newAuras,
      },
    });

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "atlanteanFateResolve",
          id: pending.id,
          aura,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const cellNo = getCellNumber(cornerX, cornerY, board.size.w);
    const floodCount = floodedSites.length;
    const submergeMsg =
      submergedCount > 0
        ? ` ${submergedCount} permanent${submergedCount !== 1 ? "s" : ""} submerged!`
        : "";
    get().log(
      `Atlantean Fate resolved at #${cellNo}! ${floodCount} non-ordinary site${
        floodCount !== 1 ? "s" : ""
      } flooded.${submergeMsg}`,
    );
  },

  replaceAtlanteanFate: () => {
    const pending = get().pendingAtlanteanFate;
    if (!pending || pending.phase !== "confirming") return;

    const state = get();
    const { spell, casterSeat } = pending;

    // Remove the aura permanent from the board
    const permanentsNext = { ...state.permanents };
    const cellPerms = permanentsNext[spell.at];
    if (cellPerms && cellPerms[spell.index]) {
      const newArr = [...cellPerms];
      newArr.splice(spell.index, 1);
      if (newArr.length === 0) {
        delete permanentsNext[spell.at];
      } else {
        permanentsNext[spell.at] = newArr;
      }
    }

    // Return the card to the player's hand
    const zonesNext = { ...state.zones };
    const playerZones = { ...zonesNext[casterSeat] };
    const handNext = [...playerZones.hand, spell.card];
    playerZones.hand = handNext;
    zonesNext[casterSeat] = playerZones;

    // Clear pending state - card goes back to hand for replay
    set({
      pendingAtlanteanFate: null,
      permanents: permanentsNext,
      zones: zonesNext,
    } as Partial<GameState> as GameState);

    // Broadcast re-place to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "atlanteanFateReplace",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Send state patch
    get().trySendPatch({
      permanents: permanentsNext,
      zones: zonesNext,
      pendingAtlanteanFate: null,
    });

    get().log(
      "Atlantean Fate returned to hand - play it again to choose a new area",
    );
  },

  cancelAtlanteanFate: () => {
    const pending = get().pendingAtlanteanFate;
    if (!pending) return;

    // Spell stays on board - we only cancel the automatic effects (area selection)
    // The Aura permanent remains in play without the flood effect

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "atlanteanFateCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Atlantean Fate targeting cancelled - spell remains on board");
    set({ pendingAtlanteanFate: null } as Partial<GameState> as GameState);
  },

  isSiteFlooded: (cellKey) => {
    const state = get();
    const auras = state.specialSiteState?.atlanteanFateAuras || [];
    const permanents = state.permanents;
    for (const aura of auras) {
      if (aura.floodedSites.includes(cellKey)) {
        // Check if this aura is silenced - silenced auras don't apply their effect
        const permsAtAura = permanents[aura.permanentAt] || [];
        const isSilenced = permsAtAura.some(
          (p) => String(p.card?.name || "").toLowerCase() === "silenced",
        );
        if (isSilenced) continue; // Skip silenced auras
        return true;
      }
    }
    return false;
  },

  removeAtlanteanFateAura: (auraId) => {
    console.log(
      `[AtlanteanFate] removeAtlanteanFateAura called with id: ${auraId}`,
    );
    const state = get();
    const currentState = state.specialSiteState;

    // Find the aura being removed to get its flooded sites
    const auraToRemove = currentState.atlanteanFateAuras.find(
      (a) => a.id === auraId,
    );
    console.log(`[AtlanteanFate] Aura to remove:`, auraToRemove);

    const newAuras = currentState.atlanteanFateAuras.filter(
      (a) => a.id !== auraId,
    );

    if (newAuras.length === currentState.atlanteanFateAuras.length) {
      console.log(
        `[AtlanteanFate] No aura found with id ${auraId}, skipping cleanup`,
      );
      return; // No change
    }
    console.log(
      `[AtlanteanFate] Removing aura, flooded sites were: ${auraToRemove?.floodedSites.join(", ")}`,
    );

    // Clean up flooded sites - remove Flooded tokens only
    // Note: Submerged minions stay submerged (they were affected at Genesis, not ongoing)
    if (auraToRemove) {
      const permanents = state.permanents;
      let permanentsNext = { ...permanents };
      let permanentsChanged = false;

      for (const cellKey of auraToRemove.floodedSites) {
        const cellPerms = permanentsNext[cellKey];
        if (!cellPerms) continue;

        // Remove Flooded tokens from this cell
        const filteredPerms = cellPerms.filter((perm) => {
          const name = String(perm.card?.name || "").toLowerCase();
          return name !== "flooded";
        });

        if (filteredPerms.length !== cellPerms.length) {
          permanentsNext = { ...permanentsNext, [cellKey]: filteredPerms };
          permanentsChanged = true;
        }
      }

      // Update permanents if any Flooded tokens were removed
      if (permanentsChanged) {
        set({ permanents: permanentsNext } as Partial<GameState> as GameState);
        get().trySendPatch({ permanents: permanentsNext });
      }
    }

    // Update special site state
    const newSpecialSiteState = {
      ...currentState,
      atlanteanFateAuras: newAuras,
    };

    set({
      specialSiteState: newSpecialSiteState,
    } as Partial<GameState> as GameState);

    // Send patch for sync
    get().trySendPatch({
      specialSiteState: newSpecialSiteState,
    });

    get().log("Atlantean Fate effect ended - sites unflooded");
  },
});
