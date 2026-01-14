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
 * Check if a site is "ordinary" (basic elemental site that just provides mana/threshold).
 * In Sorcery TCG, "Ordinary" is a rarity for basic sites.
 * Non-ordinary sites have special abilities and get flooded by Atlantean Fate.
 *
 * This checks the site's rarity if available, or falls back to name matching.
 */
export function isOrdinarySite(
  siteName: string | null | undefined,
  siteRarity?: string | null
): boolean {
  // Check rarity first - "Ordinary" rarity sites are ordinary
  if (siteRarity) {
    const rarityLc = siteRarity.toLowerCase().trim();
    if (rarityLc === "ordinary") return true;
  }

  // Fallback: check name for basic elemental sites
  if (!siteName) return false;
  const lc = siteName.toLowerCase().trim();

  // Basic elemental sites (Air, Water, Earth, Fire, or with "Site" suffix)
  const ordinaryPatterns = [
    /^(air|water|earth|fire)$/i, // Just the element name
    /^(air|water|earth|fire)\s+site$/i, // Element + Site
  ];
  for (const pattern of ordinaryPatterns) {
    if (pattern.test(lc)) return true;
  }
  return false;
}

/**
 * Calculate the 2x2 area the aura occupies.
 * Per rules: "aura is cast at the intersection of four squares"
 * The card sits at the CENTER of the 2x2 area.
 * The 4 tiles around the card's center (lower-left corner of anchor tile):
 * - (x-1, y-1) lower-left
 * - (x, y-1) lower-right
 * - (x-1, y) upper-left
 * - (x, y) upper-right (anchor tile)
 */
export function calculate2x2Area(
  cardX: number,
  cardY: number,
  boardWidth: number,
  boardHeight: number
): CellKey[] {
  const cells: CellKey[] = [];
  // Card is at center of 2x2 - the 4 tiles meeting at that intersection
  const offsets = [
    { dx: -1, dy: -1 }, // lower-left
    { dx: 0, dy: -1 }, // lower-right
    { dx: -1, dy: 0 }, // upper-left
    { dx: 0, dy: 0 }, // upper-right (anchor tile)
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
 * Check if an intersection position allows a valid 2x2 area.
 * An aura MUST affect exactly 4 tiles - it cannot be placed at edges.
 * The intersection is at the lower-left corner of the anchor tile (cursorX, cursorY).
 * Required tiles: (x-1, y), (x, y), (x-1, y-1), (x, y-1)
 */
export function isValidCornerPosition(
  cursorX: number,
  cursorY: number,
  boardWidth: number,
  boardHeight: number
): boolean {
  // Check that all 4 tiles around the intersection exist
  // The intersection is at the lower-left corner of anchor tile (cursorX, cursorY)
  // Required tiles:
  // - (cursorX-1, cursorY) upper-left - needs x >= 1
  // - (cursorX, cursorY) upper-right - needs x < boardWidth, y < boardHeight
  // - (cursorX-1, cursorY-1) lower-left - needs x >= 1, y >= 1
  // - (cursorX, cursorY-1) lower-right - needs y >= 1

  if (cursorX < 1) return false; // Need tile to the left
  if (cursorX >= boardWidth) return false;
  if (cursorY < 1) return false; // Need tile below
  if (cursorY >= boardHeight) return false;

  return true;
}

export type AtlanteanFateSlice = Pick<
  GameState,
  | "pendingAtlanteanFate"
  | "beginAtlanteanFate"
  | "setAtlanteanFatePreview"
  | "selectAtlanteanFateCorner"
  | "resolveAtlanteanFate"
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
        `⚠️ Atlantean Fate must be placed at an intersection of 4 tiles, not at the edge of the board`
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
      `[${casterSeat.toUpperCase()}] casts Atlantean Fate - confirm to apply flood effects`
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
      `Selected corner #${cellNo} for Atlantean Fate - click Confirm to place`
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
      board.size.h
    );

    // Find non-ordinary sites to flood
    // Ordinary sites (basic elemental sites with "Ordinary" rarity) are NOT flooded
    const floodedSites: CellKey[] = [];
    for (const cellKey of coveredCells) {
      const site = board.sites[cellKey];
      if (site && site.card) {
        const siteName = site.card.name;
        const siteRarity = (site.card as { rarity?: string }).rarity;
        if (!isOrdinarySite(siteName, siteRarity)) {
          floodedSites.push(cellKey);
        }
      }
    }

    // Collect minions and artifacts on non-ordinary sites to submerge (send to graveyard)
    // We need to process these before creating the aura
    const toSubmerge: Array<{
      cellKey: CellKey;
      index: number;
      card: unknown;
    }> = [];

    for (const cellKey of floodedSites) {
      const cellPermanents = permanents[cellKey] || [];
      // Iterate in reverse to collect indices correctly
      for (let i = cellPermanents.length - 1; i >= 0; i--) {
        const perm = cellPermanents[i];
        const cardType = perm.card?.type?.toLowerCase() || "";
        // Submerge minions and artifacts (not sites, not tokens, not avatars)
        if (cardType === "minion" || cardType === "artifact") {
          toSubmerge.push({ cellKey, index: i, card: perm.card });
        }
      }
    }

    // Submerge all collected permanents (send to graveyard)
    // Process in reverse order of collection to maintain correct indices
    let submergedCount = 0;
    for (const item of toSubmerge) {
      try {
        get().movePermanentToZone(item.cellKey, item.index, "graveyard");
        submergedCount++;
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
        ? ` ${submergedCount} permanent${
            submergedCount !== 1 ? "s" : ""
          } submerged!`
        : "";
    get().log(
      `Atlantean Fate resolved at #${cellNo}! ${floodCount} non-ordinary site${
        floodCount !== 1 ? "s" : ""
      } flooded.${submergeMsg}`
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
    for (const aura of auras) {
      if (aura.floodedSites.includes(cellKey)) {
        return true;
      }
    }
    return false;
  },

  removeAtlanteanFateAura: (auraId) => {
    const currentState = get().specialSiteState;
    const newAuras = currentState.atlanteanFateAuras.filter(
      (a) => a.id !== auraId
    );

    if (newAuras.length === currentState.atlanteanFateAuras.length) {
      return; // No change
    }

    set({
      specialSiteState: {
        ...currentState,
        atlanteanFateAuras: newAuras,
      },
    } as Partial<GameState> as GameState);

    // Send patch for sync
    get().trySendPatch({
      specialSiteState: {
        ...currentState,
        atlanteanFateAuras: newAuras,
      },
    });

    get().log("Atlantean Fate aura removed");
  },
});
