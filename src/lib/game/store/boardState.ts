import type { StateCreator } from "zustand";
import {
  TOKEN_BY_NAME,
  tokenSlug,
  newTokenInstanceId,
} from "@/lib/game/tokens";
import { isMergedTower } from "./babelTowerState";
import type {
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import {
  getCellNumber,
  parseCellKey,
  seatFromOwner,
  toCellKey,
} from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";
import {
  createZonesPatchFor,
  removeCardInstanceFromAllZones,
} from "./utils/zoneHelpers";

export const createInitialBoard = (): GameState["board"] => ({
  size: { w: 5, h: 4 },
  sites: {},
});

type BoardSlice = Pick<
  GameState,
  | "board"
  | "toggleTapSite"
  | "moveSiteToZone"
  | "moveSiteToGraveyardWithRubble"
  | "floodSite"
  | "silenceSite"
  | "silencePermanent"
  | "transferSiteControl"
  | "switchSitePosition"
>;

export const createBoardSlice: StateCreator<GameState, [], [], BoardSlice> = (
  set,
  get,
) => ({
  board: createInitialBoard(),

  toggleTapSite: () =>
    set((state) => {
      get().log("Sites do not tap.");
      return state as GameState;
    }),

  moveSiteToZone: (x, y, target, position) =>
    set((state) => {
      get().pushHistory();
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site || !site.card) return state;

      // Check if this is a merged Tower of Babel (Base + Apex stacked)
      const towerMerge = isMergedTower(key, state.babelTowers);
      if (towerMerge) {
        if (target === "graveyard" || target === "banished") {
          // Use the dedicated Tower destruction handler - both cards to graveyard
          setTimeout(() => {
            get().destroyBabelTower(key);
          }, 0);
          return state;
        } else if (target === "hand") {
          // Tower bounced to hand - return BOTH cards to hand and clean up
          setTimeout(() => {
            get().returnBabelTowerToHand(key);
          }, 0);
          return state;
        }
      }
      // Only enforce ownership checks in online mode when actorKey is set
      // In hotseat mode (actorKey is null), allow all actions
      if (state.transport && state.actorKey) {
        const ownerKey = seatFromOwner(site.owner);
        const isOwner = state.actorKey === ownerKey;
        // Acting player can send opponent's sites to graveyard/banished (destroy effects)
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        const canMoveToDestructiveZone =
          target === "graveyard" || target === "banished";
        if (!isOwner && !(isActingPlayer && canMoveToDestructiveZone)) {
          get().log("Cannot move opponent's site to a zone");
          return state as GameState;
        }
      }
      const owner = seatFromOwner(site.owner);
      const sites = { ...state.board.sites };
      delete sites[key];
      const zones = { ...state.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };

      const movedSiteCard = site.card
        ? prepareCardForSeat(site.card, owner)
        : site.card;
      if (target === "hand" && movedSiteCard) {
        z.hand = [...z.hand, movedSiteCard];
      } else if (target === "graveyard" && movedSiteCard) {
        z.graveyard = [movedSiteCard, ...z.graveyard];
      } else if (target === "atlas" && movedSiteCard) {
        const pile = [...z.atlas];
        if (position === "top") pile.unshift(movedSiteCard);
        else pile.push(movedSiteCard);
        z.atlas = pile;
      } else if (movedSiteCard) {
        z.banished = [...z.banished, movedSiteCard];
      }
      zones[owner] = z;
      const cellNo = getCellNumber(x, y, state.board.size.w);
      const label =
        target === "hand"
          ? "hand"
          : target === "graveyard"
            ? "cemetery"
            : target === "atlas"
              ? "atlas"
              : "banished";
      const playerNum = owner === "p1" ? "1" : "2";
      const zoneLabel =
        label === "hand"
          ? "hand"
          : label === "cemetery"
            ? "cemetery"
            : label === "atlas"
              ? "Atlas"
              : "banished";
      get().log(
        `[p${playerNum}:PLAYER] moved site [p${playerNum}card:${site.card.name}] from #${cellNo} to ${zoneLabel}`,
      );
      // Broadcast toast to both players
      const toastMessage = `[p${playerNum}:PLAYER] moved [p${playerNum}card:${site.card.name}] to ${zoneLabel}`;
      const boardNext = { ...state.board, sites } as GameState["board"];
      const tr = get().transport;
      if (tr) {
        // Build a sites patch that explicitly sets deleted site to null
        // This is necessary because deepMergeReplaceArrays won't remove keys
        // that are missing from the patch - it only updates present keys
        const sitesPatch: Record<string, unknown> = { [key]: null };
        // Create zone patch for owner only
        const zonePatch = createZonesPatchFor(
          zones as GameState["zones"],
          owner,
        );
        const patch: ServerPatchT = {
          board: { ...boardNext, sites: sitesPatch as typeof boardNext.sites },
          ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
        };
        console.log(
          "[moveSiteToZone] final patch zones keys:",
          patch.zones ? Object.keys(patch.zones) : "none",
        );
        get().trySendPatch(patch);
        try {
          tr.sendMessage?.({
            type: "toast",
            text: toastMessage,
            seat: owner,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage },
              }),
            );
          }
        } catch {}
      }

      // Remove any special site effects (e.g., Mismanaged Mortuary cemetery swap)
      // Must be called after state update via setTimeout
      setTimeout(() => {
        get().removeSiteChoice(key);
      }, 0);

      return {
        board: boardNext,
        zones,
      } as Partial<GameState> as GameState;
    }),

  // Atomic operation: move site to graveyard and optionally place Rubble token
  // This ensures both operations are sent in a single patch for proper sync
  moveSiteToGraveyardWithRubble: (x, y, placeRubble) =>
    set((state) => {
      get().pushHistory();
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site || !site.card) return state;

      // Check if this is a merged Tower of Babel (Base + Apex stacked)
      // If so, use destroyBabelTower which handles both cards going to graveyard
      const towerMerge = isMergedTower(key, state.babelTowers);
      if (towerMerge) {
        // Use the dedicated Tower destruction handler - both cards to graveyard
        // Pass placeRubble flag so Rubble token can be placed if requested
        setTimeout(() => {
          get().destroyBabelTower(key, placeRubble);
        }, 0);
        return state;
      }

      // Ownership checks (same as moveSiteToZone)
      if (state.transport && state.actorKey) {
        const ownerKey = seatFromOwner(site.owner);
        const isOwner = state.actorKey === ownerKey;
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (!isOwner && !isActingPlayer) {
          get().log("Cannot move opponent's site to graveyard");
          return state as GameState;
        }
      }

      const siteOwner = site.owner;
      const owner = seatFromOwner(siteOwner);

      // Remove site from board
      const sites = { ...state.board.sites };
      delete sites[key];

      // Add site card to graveyard
      const zones = { ...state.zones } as Record<PlayerKey, Zones>;
      const z = { ...zones[owner] };
      const movedSiteCard = site.card
        ? prepareCardForSeat(site.card, owner)
        : site.card;
      if (movedSiteCard) {
        z.graveyard = [movedSiteCard, ...z.graveyard];
      }
      zones[owner] = z;

      // Optionally place Rubble token
      let permanentsNext = state.permanents;
      if (placeRubble) {
        const rubbleDef = TOKEN_BY_NAME["rubble"];
        if (rubbleDef) {
          const rubbleCard = prepareCardForSeat(
            {
              cardId: newTokenInstanceId(rubbleDef),
              variantId: null,
              name: rubbleDef.name,
              type: "Token",
              slug: tokenSlug(rubbleDef),
              thresholds: null,
            },
            owner,
          );
          permanentsNext = { ...state.permanents };
          const arr = [...(permanentsNext[key] || [])];
          arr.push({
            owner: siteOwner,
            card: rubbleCard,
            offset: null,
            tilt: randomTilt(),
            tapVersion: 0,
            tapped: false,
            version: 0,
            instanceId: rubbleCard.instanceId ?? newPermanentInstanceId(),
          });
          permanentsNext[key] = arr;
          const playerNum = owner === "p1" ? "1" : "2";
          get().log(
            `[p${playerNum}:PLAYER] places [p${playerNum}card:Rubble] at #${getCellNumber(
              x,
              y,
              state.board.size.w,
            )}`,
          );
        }
      }

      const cellNo = getCellNumber(x, y, state.board.size.w);
      const playerNum = owner === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] moved site [p${playerNum}card:${site.card.name}] from #${cellNo} to cemetery`,
      );

      const boardNext = { ...state.board, sites } as GameState["board"];

      // Send combined patch with board, zones, and permanents
      const tr = get().transport;
      if (tr) {
        // Build a sites patch that explicitly sets deleted site to null
        // This is necessary because deepMergeReplaceArrays won't remove keys
        // that are missing from the patch - it only updates present keys
        const sitesPatch: Record<string, unknown> = { [key]: null };
        // Create zone patch for owner only
        const zonePatch = createZonesPatchFor(
          zones as GameState["zones"],
          owner,
        );
        const patch: ServerPatchT = {
          board: { ...boardNext, sites: sitesPatch as typeof boardNext.sites },
          ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
          ...(placeRubble ? { permanents: permanentsNext } : {}),
        };
        get().trySendPatch(patch);

        // Send toast
        const toastMessage = `[p${playerNum}:PLAYER] moved [p${playerNum}card:${
          site.card.name
        }] to cemetery${placeRubble ? " (Rubble placed)" : ""}`;
        try {
          tr.sendMessage?.({
            type: "toast",
            text: toastMessage,
            seat: owner,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        const toastMessage = `[p${playerNum}:PLAYER] moved [p${playerNum}card:${
          site.card.name
        }] to cemetery${placeRubble ? " (Rubble placed)" : ""}`;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage },
              }),
            );
          }
        } catch {}
      }

      // Remove any special site effects (e.g., Mismanaged Mortuary cemetery swap)
      // Must be called after state update via setTimeout
      setTimeout(() => {
        get().removeSiteChoice(key);
      }, 0);

      return {
        board: boardNext,
        zones,
        ...(placeRubble ? { permanents: permanentsNext } : {}),
      } as Partial<GameState> as GameState;
    }),

  // Place a Flooded token on top of a site (flood effect)
  floodSite: (x: number, y: number) =>
    set((state) => {
      get().pushHistory();
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site) {
        get().log("No site at this position to flood");
        return state;
      }

      // Ownership checks
      if (state.transport && state.actorKey) {
        const ownerKey = seatFromOwner(site.owner);
        const isOwner = state.actorKey === ownerKey;
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (!isOwner && !isActingPlayer) {
          get().log("Cannot flood opponent's site");
          return state;
        }
      }

      const siteOwner = site.owner;
      const owner = seatFromOwner(siteOwner);

      // Create Flooded token
      const floodedDef = TOKEN_BY_NAME["flooded"];
      if (!floodedDef) {
        get().log("Flooded token definition not found");
        return state;
      }

      const floodedCard = prepareCardForSeat(
        {
          cardId: newTokenInstanceId(floodedDef),
          variantId: null,
          name: floodedDef.name,
          type: "Token",
          slug: tokenSlug(floodedDef),
          thresholds: null,
        },
        owner,
      );

      const permanentsNext = { ...state.permanents };
      const arr = [...(permanentsNext[key] || [])];
      arr.push({
        owner: siteOwner,
        card: floodedCard,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: floodedCard.instanceId ?? newPermanentInstanceId(),
      });
      permanentsNext[key] = arr;

      const cellNo = getCellNumber(x, y, state.board.size.w);
      const playerNum = owner === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] places [p${playerNum}card:Flooded] on site at #${cellNo}`,
      );

      // Send patch
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          permanents: permanentsNext,
        };
        get().trySendPatch(patch);

        // Send toast
        const toastMessage = `[p${playerNum}:PLAYER] flooded site at #${cellNo}`;
        try {
          tr.sendMessage?.({
            type: "toast",
            text: toastMessage,
            cellKey: key,
            seat: owner,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        const toastMessage = `[p${playerNum}:PLAYER] flooded site at #${cellNo}`;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey: key },
              }),
            );
          }
        } catch {}
      }

      return {
        permanents: permanentsNext,
      } as Partial<GameState> as GameState;
    }),

  // Place a Silenced token on top of a site (removes site abilities)
  silenceSite: (x: number, y: number) =>
    set((state) => {
      get().pushHistory();
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site) {
        get().log("No site at this position to silence");
        return state;
      }

      // Ownership checks
      if (state.transport && state.actorKey) {
        const ownerKey = seatFromOwner(site.owner);
        const isOwner = state.actorKey === ownerKey;
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (!isOwner && !isActingPlayer) {
          get().log("Cannot silence opponent's site");
          return state;
        }
      }

      const siteOwner = site.owner;
      const owner = seatFromOwner(siteOwner);

      // Create Silenced token
      const silencedDef = TOKEN_BY_NAME["silenced"];
      if (!silencedDef) {
        get().log("Silenced token definition not found");
        return state;
      }

      const silencedCard = prepareCardForSeat(
        {
          cardId: newTokenInstanceId(silencedDef),
          variantId: null,
          name: silencedDef.name,
          type: "Token",
          slug: tokenSlug(silencedDef),
          thresholds: null,
        },
        owner,
      );

      const permanentsNext = { ...state.permanents };
      const arr = [...(permanentsNext[key] || [])];
      arr.push({
        owner: siteOwner,
        card: silencedCard,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: silencedCard.instanceId ?? newPermanentInstanceId(),
      });
      permanentsNext[key] = arr;

      const cellNo = getCellNumber(x, y, state.board.size.w);
      const playerNum = owner === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] places [p${playerNum}card:Silenced] on site at #${cellNo}`,
      );

      // Send patch
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          permanents: permanentsNext,
        };
        get().trySendPatch(patch);

        // Send toast
        const toastMessage = `[p${playerNum}:PLAYER] silenced site at #${cellNo}`;
        try {
          tr.sendMessage?.({
            type: "toast",
            text: toastMessage,
            cellKey: key,
            seat: owner,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        const toastMessage = `[p${playerNum}:PLAYER] silenced site at #${cellNo}`;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey: key },
              }),
            );
          }
        } catch {}
      }

      return {
        permanents: permanentsNext,
      } as Partial<GameState> as GameState;
    }),

  // Place a Silenced token attached to a permanent (aura or minion)
  silencePermanent: (cellKey: CellKey, index: number) =>
    set((state) => {
      get().pushHistory();
      const arr = state.permanents[cellKey];
      if (!arr || !arr[index]) {
        get().log("No permanent at this position to silence");
        return state;
      }

      const item = arr[index];
      const cardType = (item.card?.type || "").toLowerCase();
      const cardName = item.card?.name || "Permanent";

      // Check if this is a valid target (aura, minion, or artifact with ability)
      const isAura =
        cardType.includes("aura") ||
        (item.card?.subTypes || "").toLowerCase().includes("aura");
      const isMinion = cardType.includes("minion");
      const isArtifact = cardType.includes("artifact");
      if (!isAura && !isMinion && !isArtifact) {
        get().log("Can only silence auras, minions, or artifacts");
        return state;
      }

      // Ownership checks
      const ownerKey = seatFromOwner(item.owner);
      if (state.transport && state.actorKey) {
        const isOwner = state.actorKey === ownerKey;
        const isActingPlayer =
          (state.actorKey === "p1" && state.currentPlayer === 1) ||
          (state.actorKey === "p2" && state.currentPlayer === 2);
        if (!isOwner && !isActingPlayer) {
          get().log("Cannot silence opponent's permanent");
          return state;
        }
      }

      // Create Silenced token
      const silencedDef = TOKEN_BY_NAME["silenced"];
      if (!silencedDef) {
        get().log("Silenced token definition not found");
        return state;
      }

      const silencedCard = prepareCardForSeat(
        {
          cardId: newTokenInstanceId(silencedDef),
          variantId: null,
          name: silencedDef.name,
          type: "Token",
          slug: tokenSlug(silencedDef),
          thresholds: null,
        },
        ownerKey,
      );

      const permanentsNext = { ...state.permanents };
      const cellArr = [...(permanentsNext[cellKey] || [])];

      // Add silenced token attached to the permanent
      cellArr.push({
        owner: item.owner,
        card: silencedCard,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: silencedCard.instanceId ?? newPermanentInstanceId(),
        attachedTo: { at: cellKey, index },
      });
      permanentsNext[cellKey] = cellArr;

      const { x, y } = parseCellKey(cellKey);
      const cellNo = getCellNumber(x, y, state.board.size.w);
      const playerNum = ownerKey === "p1" ? "1" : "2";
      get().log(
        `[p${playerNum}:PLAYER] places [p${playerNum}card:Silenced] on ${cardName} at #${cellNo}`,
      );

      // Send patch
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          permanents: permanentsNext,
        };
        get().trySendPatch(patch);

        // Send toast
        const toastMessage = `[p${playerNum}:PLAYER] silenced ${cardName} at #${cellNo}`;
        try {
          tr.sendMessage?.({
            type: "toast",
            text: toastMessage,
            cellKey,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        const toastMessage = `[p${playerNum}:PLAYER] silenced ${cardName} at #${cellNo}`;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey },
              }),
            );
          }
        } catch {}
      }

      return {
        permanents: permanentsNext,
      } as Partial<GameState> as GameState;
    }),

  transferSiteControl: (x, y, to) =>
    set((state) => {
      get().pushHistory();
      const key = toCellKey(x, y);
      const site = state.board.sites[key];
      if (!site) return state;
      // Only enforce ownership checks in online mode when actorKey is set
      // In hotseat mode (actorKey is null), allow all actions
      if (state.transport && state.actorKey) {
        const ownerSeat = seatFromOwner(site.owner);
        if (state.actorKey !== ownerSeat) {
          get().log("Cannot transfer opponent site");
          return state as GameState;
        }
      }
      const fromOwner = site.owner;
      const newOwner: 1 | 2 = to ?? (fromOwner === 1 ? 2 : 1);
      const newOwnerSeat = seatFromOwner(newOwner);
      const updatedSiteCard = site.card
        ? prepareCardForSeat(site.card, newOwnerSeat)
        : site.card;
      const sites = {
        ...state.board.sites,
        [key]: { ...site, owner: newOwner, card: updatedSiteCard },
      };
      let zonesNext = state.zones;
      let changedSeats: PlayerKey[] = [];
      if (updatedSiteCard?.instanceId) {
        const removal = removeCardInstanceFromAllZones(
          state.zones,
          updatedSiteCard.instanceId,
        );
        if (removal) {
          zonesNext = removal.zones;
          changedSeats = removal.seats;
        }
      }
      const zonePatch = createZonesPatchFor(
        zonesNext as GameState["zones"],
        changedSeats.length ? changedSeats : [newOwnerSeat],
      );
      const boardNext = { ...state.board, sites } as GameState["board"];
      get().log(
        `Site at #${getCellNumber(
          x,
          y,
          state.board.size.w,
        )} transfers to P${newOwner}`,
      );
      const tr = get().transport;
      if (tr) {
        const patch: ServerPatchT = {
          board: boardNext,
          ...(zonePatch?.zones ? { zones: zonePatch.zones } : {}),
        };
        get().trySendPatch(patch);
      }
      return {
        board: boardNext,
        ...(zonePatch?.zones ? { zones: zonesNext } : {}),
      } as Partial<GameState> as GameState;
    }),

  switchSitePosition: (sourceX, sourceY, targetX, targetY) =>
    set((state) => {
      get().pushHistory();
      const sourceKey = toCellKey(sourceX, sourceY);
      const targetKey = toCellKey(targetX, targetY);

      // Validate source has a site
      const sourceSite = state.board.sites[sourceKey];
      if (!sourceSite) {
        get().log("No site at source position to move");
        return state;
      }

      // Check actor permissions in online mode
      if (state.transport && state.actorKey) {
        const ownerSeat = seatFromOwner(sourceSite.owner);
        if (state.actorKey !== ownerSeat) {
          get().log("Cannot move opponent's site without consent");
          return state;
        }
      }

      const targetSite = state.board.sites[targetKey];
      const isSwap = !!targetSite;

      // Build new sites map
      const sites = { ...state.board.sites };
      if (isSwap) {
        // Swap sites
        sites[sourceKey] = targetSite;
        sites[targetKey] = sourceSite;
      } else {
        // Move to void
        delete sites[sourceKey];
        sites[targetKey] = sourceSite;
      }

      // Build new permanents map - swap all permanents between cells
      // IMPORTANT: Deep copy the arrays to avoid reference issues
      const permanents = { ...state.permanents };
      const sourcePerms = [...(state.permanents[sourceKey] || [])];
      const targetPerms = [...(state.permanents[targetKey] || [])];

      if (isSwap) {
        // Swap: source gets target's permanents, target gets source's permanents
        if (targetPerms.length > 0) {
          permanents[sourceKey] = targetPerms;
        } else {
          delete permanents[sourceKey];
        }
        if (sourcePerms.length > 0) {
          permanents[targetKey] = sourcePerms;
        } else {
          delete permanents[targetKey];
        }
      } else {
        // Move to void: target gets source's permanents, source becomes empty
        delete permanents[sourceKey];
        if (sourcePerms.length > 0) {
          permanents[targetKey] = sourcePerms;
        }
      }

      // Handle avatars - update positions for any avatar on either cell
      const avatars = { ...state.avatars };
      for (const seat of ["p1", "p2"] as PlayerKey[]) {
        const avatar = avatars[seat];
        if (!avatar?.pos) continue;
        const [ax, ay] = avatar.pos;
        if (ax === sourceX && ay === sourceY) {
          avatars[seat] = {
            ...avatar,
            pos: [targetX, targetY] as [number, number],
          };
        } else if (isSwap && ax === targetX && ay === targetY) {
          avatars[seat] = {
            ...avatar,
            pos: [sourceX, sourceY] as [number, number],
          };
        }
      }

      const boardNext = { ...state.board, sites } as GameState["board"];
      const sourceCellNo = getCellNumber(sourceX, sourceY, state.board.size.w);
      const targetCellNo = getCellNumber(targetX, targetY, state.board.size.w);

      if (isSwap) {
        get().log(
          `Switched site positions: #${sourceCellNo} <-> #${targetCellNo}`,
        );
      } else {
        get().log(
          `Moved site from #${sourceCellNo} to void at #${targetCellNo}`,
        );
      }

      // Send patch in online mode
      const tr = get().transport;
      if (tr) {
        // Build a sites patch that explicitly sets deleted sites to null
        // This is necessary because deepMergeReplaceArrays won't remove keys
        // that are missing from the patch - it only updates present keys
        const sitesPatch: Record<string, unknown> = {};
        if (isSwap) {
          sitesPatch[sourceKey] = sites[sourceKey];
          sitesPatch[targetKey] = sites[targetKey];
        } else {
          // Move to void: explicitly set source to null for deletion
          sitesPatch[sourceKey] = null;
          sitesPatch[targetKey] = sites[targetKey];
        }

        // For site switching, we need to send the COMPLETE permanents state
        // to avoid merge issues. Use __replaceKeys to force replacement.
        const patch: ServerPatchT = {
          __replaceKeys: ["permanents"],
          board: { ...boardNext, sites: sitesPatch as typeof boardNext.sites },
          permanents: permanents as ServerPatchT["permanents"],
          avatars,
        };
        get().trySendPatch(patch);
      }

      return {
        board: boardNext,
        permanents,
        avatars,
      } as Partial<GameState> as GameState;
    }),
});
