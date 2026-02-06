import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import { isMergedTower } from "./babelTowerState";
import type {
  BabelTowerMerge,
  CardRef,
  CellKey,
  GameState,
  PendingMirrorRealm,
  ServerPatchT,
  SiteTile,
} from "./types";
import { getCellNumber } from "./utils/boardHelpers";
import { getNearbyCells } from "./utils/boardHelpers";

function newMirrorRealmId() {
  return `mirror_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type MirrorRealmSlice = Pick<
  GameState,
  | "pendingMirrorRealm"
  | "beginMirrorRealm"
  | "selectMirrorRealmTarget"
  | "resolveMirrorRealm"
  | "cancelMirrorRealm"
>;

export const createMirrorRealmSlice: StateCreator<
  GameState,
  [],
  [],
  MirrorRealmSlice
> = (set, get) => ({
  pendingMirrorRealm: null,

  beginMirrorRealm: (input) => {
    const { mirrorRealmCell, casterSeat } = input;
    const state = get();
    const id = newMirrorRealmId();

    // Get nearby cells (8 surrounding squares)
    const nearbyCells = getNearbyCells(
      mirrorRealmCell,
      state.board.size.w,
      state.board.size.h,
    );

    // Filter to only cells with sites (not void)
    const nearbySites = nearbyCells.filter((cellKey) => {
      const site = state.board.sites[cellKey];
      return site && site.card;
    });

    if (nearbySites.length === 0) {
      // No nearby sites to copy - cancel
      get().log(
        `[${casterSeat.toUpperCase()}] Mirror Realm has no nearby sites to copy`,
      );
      return;
    }

    const pending: PendingMirrorRealm = {
      id,
      casterSeat,
      mirrorRealmCell,
      phase: "selecting",
      nearbySites,
      selectedTarget: null,
      createdAt: Date.now(),
    };

    set({ pendingMirrorRealm: pending });

    const cellNo = getCellNumber(
      ...(mirrorRealmCell.split(",").map(Number) as [number, number]),
      state.board.size.w,
    );

    get().log(
      `[${casterSeat.toUpperCase()}] Mirror Realm at #${cellNo} - selecting nearby site to copy`,
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mirrorRealmBegin",
          id,
          casterSeat,
          mirrorRealmCell,
          nearbySites,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectMirrorRealmTarget: (targetCell: CellKey) => {
    const pending = get().pendingMirrorRealm;
    if (!pending || pending.phase !== "selecting") return;

    // Verify target is in nearby sites
    if (!pending.nearbySites.includes(targetCell)) {
      console.warn("[MirrorRealm] Invalid target cell");
      return;
    }

    set({
      pendingMirrorRealm: {
        ...pending,
        selectedTarget: targetCell,
      },
    });

    // Broadcast selection to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mirrorRealmSelect",
          id: pending.id,
          targetCell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveMirrorRealm: () => {
    const pending = get().pendingMirrorRealm;
    if (!pending || !pending.selectedTarget) return;

    const state = get();
    const { mirrorRealmCell, selectedTarget, casterSeat } = pending;

    // Get the target site
    const targetSite = state.board.sites[selectedTarget];
    if (!targetSite || !targetSite.card) {
      console.warn("[MirrorRealm] Target site not found");
      set({ pendingMirrorRealm: null });
      return;
    }

    // Transform Mirror Realm into a copy of the target site
    const sitesNext = { ...state.board.sites };
    const mirrorSite = sitesNext[mirrorRealmCell];

    if (!mirrorSite) {
      console.warn("[MirrorRealm] Mirror Realm site not found");
      set({ pendingMirrorRealm: null });
      return;
    }

    // Create a copy of the target card with new instance ID
    const copiedCard: CardRef = {
      ...targetSite.card,
      instanceId: `mirror_copy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    };

    // Update Mirror Realm to become the copied site
    const transformedSite: SiteTile = {
      ...mirrorSite,
      card: copiedCard,
      // Keep original owner and tapped state
    };

    sitesNext[mirrorRealmCell] = transformedSite;

    // If target is a merged Tower of Babel, replicate the merge entry
    // so the copy also counts as a fully constructed Tower.
    const targetTower = isMergedTower(selectedTarget, state.babelTowers);
    let babelTowersNext = state.babelTowers;
    if (targetTower) {
      const copiedApex: CardRef = {
        ...targetTower.apexCard,
        instanceId: `mirror_apex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      };
      const mirrorMerge: BabelTowerMerge = {
        cellKey: mirrorRealmCell,
        baseCard: copiedCard, // the copied Base card is already on the site
        apexCard: copiedApex,
        towerCard: null,
        owner: mirrorSite.owner,
        createdAt: Date.now(),
      };
      babelTowersNext = [...state.babelTowers, mirrorMerge];
    }

    const boardNext = {
      ...state.board,
      sites: sitesNext,
    };

    // Get cell numbers for logging
    const mirrorCellNo = getCellNumber(
      ...(mirrorRealmCell.split(",").map(Number) as [number, number]),
      state.board.size.w,
    );
    const targetCellNo = getCellNumber(
      ...(selectedTarget.split(",").map(Number) as [number, number]),
      state.board.size.w,
    );

    const playerNum = casterSeat === "p1" ? "1" : "2";
    const logMessage = `[p${playerNum}:PLAYER] Mirror Realm at #${mirrorCellNo} transforms into [p${playerNum}card:${copiedCard.name}] (copying #${targetCellNo})`;

    get().log(logMessage);

    // Send patch to server
    const transport = state.transport;
    if (transport) {
      const patch: ServerPatchT = {
        board: boardNext,
        pendingMirrorRealm: null,
        ...(targetTower ? { babelTowers: babelTowersNext } : {}),
      };

      get().trySendPatch(patch);

      // Broadcast resolution
      try {
        transport.sendMessage?.({
          type: "mirrorRealmResolve",
          id: pending.id,
          casterSeat,
          mirrorRealmCell,
          targetCell: selectedTarget,
          copiedCard,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}

      // Send toast
      try {
        transport.sendMessage?.({
          type: "toast",
          text: logMessage,
          cellKey: mirrorRealmCell,
          seat: casterSeat,
        } as unknown as CustomMessage);
      } catch {}
    } else {
      // Offline: show local toast
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: logMessage, cellKey: mirrorRealmCell },
            }),
          );
        }
      } catch {}
    }

    set({
      board: boardNext,
      pendingMirrorRealm: null,
      ...(targetTower ? { babelTowers: babelTowersNext } : {}),
    });
  },

  cancelMirrorRealm: () => {
    const pending = get().pendingMirrorRealm;
    if (!pending) return;

    get().log(
      `[${pending.casterSeat.toUpperCase()}] Mirror Realm transformation cancelled`,
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mirrorRealmCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    set({ pendingMirrorRealm: null });
  },
});
