import { create, type StateCreator } from "zustand";
import { createAccusationSlice } from "./store/accusationState";
import { createAnimistSlice } from "./store/animistState";
import { createAnnualFairSlice } from "./store/annualFairState";
import { createArtifactCastSlice } from "./store/artifactCastState";
import {
  createAssimilatorSnailSlice,
  createInitialAssimilatorSnailUsed,
} from "./store/assimilatorSnailState";
import { createAssortedAnimalsSlice } from "./store/assortedAnimalsState";
import { createAtlanteanFateSlice } from "./store/atlanteanFateState";
import { createAutoResolveSlice } from "./store/autoResolveState";
import { createAvatarSlice } from "./store/avatarState";
import {
  createBabelTowerSlice,
  createInitialBabelTowers,
} from "./store/babelTowerState";
import { createBetrayalSlice } from "./store/betrayalState";
import { createBlackMassSlice } from "./store/blackMassState";
import { createBoardSlice, createInitialBoard } from "./store/boardState";
import {
  createBoardUiSlice,
  createInitialBoardUiState,
} from "./store/boardUiState";
import { createBrowseSlice } from "./store/browseState";
import { createCallToWarSlice } from "./store/callToWarState";
import { createCardMetaSlice } from "./store/cardMetaState";
import { createChaosTwisterSlice } from "./store/chaosTwisterState";
import { createCombatSlice } from "./store/combatState";
import { createCommonSenseSlice } from "./store/commonSenseState";
import {
  createCoreSlice,
  createInitialD20Rolls,
  createInitialPlayers,
} from "./store/coreState";
import { createCorpseExplosionSlice } from "./store/corpseExplosionState";
import { createCrossroadsSlice } from "./store/crossroadsState";
import { handleCustomMessage } from "./store/customMessageHandlers";
import { createDemonicContractSlice } from "./store/demonicContractState";
import { createDholChantsSlice } from "./store/dholChantsState";
import {
  createDialogSlice,
  createInitialDialogState,
} from "./store/dialogState";
import { createDoomsdayCultSlice } from "./store/doomsdayCultState";
import {
  createDruidSlice,
  createInitialDruidFlipped,
} from "./store/druidState";
import { createEarthquakeSlice } from "./store/earthquakeState";
import { createEventSlice } from "./store/eventState";
import { createFeastForCrowsSlice } from "./store/feastForCrowsState";
import { createFrontierSettlersSlice } from "./store/frontierSettlersState";
import { createGameActionsSlice } from "./store/gameActions";
import { createGardenOfEdenSlice } from "./store/gardenOfEdenState";
import { createGemTokenSlice } from "./store/gemTokenState";
import {
  createGeomancerSlice,
  createInitialGeomancerRubbleUsed,
} from "./store/geomancerState";
import { createHeadlessHauntSlice } from "./store/headlessHauntState";
import { createHighlandPrincessSlice } from "./store/highlandPrincessState";
import { createHistorySlice } from "./store/historyState";
import { createHyperparasiteSlice } from "./store/hyperparasiteState";
import {
  createImposterMaskSlice,
  createInitialImposterMasks,
} from "./store/imposterMaskState";
import { createInfiltrateSlice } from "./store/infiltrateState";
import { createInquisitionSlice } from "./store/inquisitionState";
import { createInquisitionSummonSlice } from "./store/inquisitionSummonState";
import { createInteractionSlice } from "./store/interactionState";
import { createInterrogatorSlice } from "./store/interrogatorState";
import { createKelpCavernSlice } from "./store/kelpCavernState";
import { createKettletopLeprechaunSlice } from "./store/kettletopLeprechaunState";
import { createLegionOfGallSlice } from "./store/legionOfGallState";
import { createLilithSlice } from "./store/lilithState";
import { createMagicSlice } from "./store/magicState";
import {
  createMephistophelesSlice,
  createInitialMephistophelesSummonUsed,
} from "./store/mephistophelesState";
import { createMerlinSlice } from "./store/merlinState";
import { createMirrorRealmSlice } from "./store/mirrorRealmState";
import { createMorganaSlice } from "./store/morganaState";
import { createMotherNatureSlice } from "./store/motherNatureState";
import {
  createNecromancerSlice,
  createInitialNecromancerSkeletonUsed,
} from "./store/necromancerState";
import { createNetworkSlice } from "./store/networkState";
import { createObservatorySlice } from "./store/observatoryState";
import { createOmphalosSlice } from "./store/omphalosState";
import {
  createPathfinderSlice,
  createInitialPathfinderUsed,
} from "./store/pathfinderState";
import { createPermanentSlice } from "./store/permanentState";
import { createPigsOfTheSounderSlice } from "./store/pigsOfTheSounderState";
import { createPithImpSlice } from "./store/pithImpState";
import { createPortalSlice } from "./store/portalState";
import { createPositionSlice } from "./store/positionState";
import { createPreferenceSlice } from "./store/preferenceState";
import { createRaiseDeadSlice } from "./store/raiseDeadState";
import { createRemoteCursorSlice } from "./store/remoteCursorState";
import { createResourceSlice } from "./store/resourceState";
import { createRevealOverlaySlice } from "./store/revealOverlayState";
import { createRiverGenesisSlice } from "./store/riverGenesisState";
import { createSeaRaiderSlice } from "./store/seaRaiderState";
import { createSearingTruthSlice } from "./store/searingTruthState";
import { createSeerSlice } from "./store/seerState";
import { createSessionSlice } from "./store/sessionState";
import { createShapeshiftSlice } from "./store/shapeshiftState";
import {
  createSnapshotSlice,
  createEmptySnapshots,
} from "./store/snapshotState";
import {
  createSpecialSiteSlice,
  getEmptySpecialSiteState,
} from "./store/specialSiteState";
import { createTorshammarSlice } from "./store/torshammarState";
import {
  createTransportSlice,
  setTransportStateAccessor,
} from "./store/transportState";
import { createTurnEffectQueueSlice } from "./store/turnEffectQueueState";
import type { GameState } from "./store/types";
import { createUiSlice, createInitialUiState } from "./store/uiState";
import { createDefaultAvatars } from "./store/utils/avatarHelpers";
import { createDefaultPlayerPositions } from "./store/utils/positionHelpers";
import {
  clearHistoryStorage,
  clearSnapshotsStorageFor,
  loadHistoryFromStorage,
  loadSnapshotsFromStorageFor,
} from "./store/utils/snapshotHelpers";
import { createEmptyZonesRecord } from "./store/utils/zoneHelpers";
import {
  createZoneSlice,
  createInitialMulligans,
  createInitialMulliganDrawn,
} from "./store/zoneState";

export {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
  MAX_EVENTS,
  REMOTE_CURSOR_TTL_MS,
} from "./store/types";
export { createInitialBoard } from "./store/boardState";
export type {
  AvatarState,
  BoardPingEvent,
  BoardSize,
  BoardState,
  CardRef,
  CellKey,
  GameEvent,
  GameState,
  GemColorId,
  GemToken,
  InteractionRecordStatus,
  InteractionRequestEntry,
  InteractionResponseOptions,
  InteractionStateMap,
  LifeState,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  PlayerState,
  PortalPlayerState,
  PortalRollPhase,
  PortalState,
  RemoteCursorState,
  ServerPatchT,
  SendInteractionRequestInput,
  SerializedGame,
  SiteTile,
  Thresholds,
  Zones,
} from "./store/types";

const createGameStoreState: StateCreator<GameState> = (set, get, storeApi) => ({
  ...createEventSlice(set, get, storeApi),
  ...createDialogSlice(set, get, storeApi),
  ...createUiSlice(set, get, storeApi),
  ...createBoardSlice(set, get, storeApi),
  ...createBoardUiSlice(set, get, storeApi),
  ...createHistorySlice(set, get, storeApi),
  ...createCoreSlice(set, get, storeApi),
  ...createResourceSlice(set, get, storeApi),
  ...createPermanentSlice(set, get, storeApi),
  ...createPositionSlice(set, get, storeApi),
  ...createAvatarSlice(set, get, storeApi),
  ...createZoneSlice(set, get, storeApi),
  ...createGameActionsSlice(set, get, storeApi),
  ...createCombatSlice(set, get, storeApi),
  ...createMagicSlice(set, get, storeApi),
  ...createChaosTwisterSlice(set, get, storeApi),
  ...createBrowseSlice(set, get, storeApi),
  ...createCallToWarSlice(set, get, storeApi),
  ...createSearingTruthSlice(set, get, storeApi),
  ...createInquisitionSlice(set, get, storeApi),
  ...createBetrayalSlice(set, get, storeApi),
  ...createInfiltrateSlice(set, get, storeApi),
  ...createInquisitionSummonSlice(set, get, storeApi),
  ...createAccusationSlice(set, get, storeApi),
  ...createCommonSenseSlice(set, get, storeApi),
  ...createCorpseExplosionSlice(set, get, storeApi),
  ...createEarthquakeSlice(set, get, storeApi),
  ...createFeastForCrowsSlice(set, get, storeApi),
  ...createPithImpSlice(set, get, storeApi),
  ...createMorganaSlice(set, get, storeApi),
  ...createOmphalosSlice(set, get, storeApi),
  ...createLilithSlice(set, get, storeApi),
  ...createMotherNatureSlice(set, get, storeApi),
  ...createMerlinSlice(set, get, storeApi),
  ...createBlackMassSlice(set, get, storeApi),
  ...createHighlandPrincessSlice(set, get, storeApi),
  ...createAssortedAnimalsSlice(set, get, storeApi),
  ...createFrontierSettlersSlice(set, get, storeApi),
  ...createGeomancerSlice(set, get, storeApi),
  ...createPigsOfTheSounderSlice(set, get, storeApi),
  ...createKettletopLeprechaunSlice(set, get, storeApi),
  ...createDemonicContractSlice(set, get, storeApi),
  ...createRaiseDeadSlice(set, get, storeApi),
  ...createLegionOfGallSlice(set, get, storeApi),
  ...createAutoResolveSlice(set, get, storeApi),
  ...createDholChantsSlice(set, get, storeApi),
  ...createAnnualFairSlice(set, get, storeApi),
  ...createDoomsdayCultSlice(set, get, storeApi),
  ...createPreferenceSlice(set, get, storeApi),
  ...createCardMetaSlice(set, get, storeApi),
  ...createSessionSlice(set, get, storeApi),
  ...createSnapshotSlice(set, get, storeApi),
  ...createRemoteCursorSlice(set, get, storeApi),
  ...createInteractionSlice(set, get, storeApi),
  ...createTransportSlice(set, get, storeApi),
  ...createNetworkSlice(set, get, storeApi),
  ...createPortalSlice(set, get, storeApi),
  ...createSeerSlice(set, get, storeApi),
  ...createImposterMaskSlice(set, get, storeApi),
  ...createNecromancerSlice(set, get, storeApi),
  ...createDruidSlice(set, get, storeApi),
  ...createSpecialSiteSlice(set, get, storeApi),
  ...createAnimistSlice(set, get, storeApi),
  ...createArtifactCastSlice(set, get, storeApi),
  ...createHeadlessHauntSlice(set, get, storeApi),
  ...createInterrogatorSlice(set, get, storeApi),
  ...createAtlanteanFateSlice(set, get, storeApi),
  ...createMephistophelesSlice(set, get, storeApi),
  ...createPathfinderSlice(set, get, storeApi),
  ...createBabelTowerSlice(set, get, storeApi),
  ...createGemTokenSlice(set, get, storeApi),
  ...createGardenOfEdenSlice(set, get, storeApi),
  ...createRevealOverlaySlice(set, get, storeApi),
  ...createRiverGenesisSlice(set, get, storeApi),
  ...createObservatorySlice(set, get, storeApi),
  ...createKelpCavernSlice(set, get, storeApi),
  ...createCrossroadsSlice(set, get, storeApi),
  ...createMirrorRealmSlice(set, get, storeApi),
  ...createTorshammarSlice(set, get, storeApi),
  ...createSeaRaiderSlice(set, get, storeApi),
  ...createShapeshiftSlice(set, get, storeApi),
  ...createAssimilatorSnailSlice(set, get, storeApi),
  ...createHyperparasiteSlice(set, get, storeApi),
  ...createTurnEffectQueueSlice(set, get, storeApi),
  cardScale: 1,
  // Harbinger portal discount (Gothic expansion) - once per turn mana reduction
  harbingerPortalDiscountUsed: { p1: false, p2: false },
  templarDiscountUsed: { p1: false, p2: false },
  // Ether Core turn-start tracking (for void mana calculation)
  etherCoresInVoidAtTurnStart: [],
  // Cores carried at turn start (for carried-core mana calculation)
  coresCarriedAtTurnStart: [],

  // Multiplayer transport (injected by online play UI)
  receiveCustomMessage: (msg) => handleCustomMessage(msg, set, get),

  // Clear snapshots and history for a truly new match (not rejoin/reload)
  clearSnapshotsForNewMatch: () => {
    const matchId = get().matchId ?? null;
    console.log("[game] Clearing snapshots and history for new match", {
      matchId,
    });
    try {
      clearSnapshotsStorageFor(matchId);
    } catch {}
    try {
      clearHistoryStorage(matchId);
    } catch {}
    set({
      snapshots: createEmptySnapshots(),
      history: [],
      historyByPlayer: { p1: [], p2: [] },
    });
  },

  // Reset all game state to initial values (preserves snapshots and history for rejoins)
  resetGameState: () =>
    set((state) => {
      console.log(
        "[game] Resetting game state (preserving snapshots and history)",
      );
      // Reload snapshots from storage instead of clearing them
      const matchId = state.matchId ?? null;
      let preservedSnapshots = state.snapshots;
      try {
        const stored = loadSnapshotsFromStorageFor(matchId);
        if (Array.isArray(stored) && stored.length > 0) {
          preservedSnapshots = stored;
        }
      } catch {}
      // Reload history from sessionStorage instead of clearing it
      let preservedHistory = state.history;
      let preservedHistoryByPlayer = state.historyByPlayer;
      try {
        const persisted = loadHistoryFromStorage(matchId);
        if (
          persisted &&
          Array.isArray(persisted.history) &&
          persisted.history.length > 0
        ) {
          preservedHistory = persisted.history;
          preservedHistoryByPlayer = persisted.historyByPlayer;
        }
      } catch {}
      const reset: Partial<GameState> = {
        players: createInitialPlayers(),
        currentPlayer: 1,
        turn: 1,
        phase: "Setup",
        hasDrawnThisTurn: false,
        lastServerTs: 0,
        lastLocalActionTs: 0,
        setupWinner: null,
        d20Rolls: createInitialD20Rolls(),
        actorKey: state.actorKey, // Preserve actorKey during reset
        matchEnded: false,
        winner: null,
        resolversDisabled: false,
        goldfishMode: false,
        goldfishHandSize: 5,
        board: createInitialBoard(),
        zones: createEmptyZonesRecord(),
        ...createInitialUiState(),
        ...createInitialBoardUiState(),
        avatars: createDefaultAvatars(),
        permanents: {},
        permanentPositions: {},
        permanentAbilities: {},
        sitePositions: {},
        playerPositions: createDefaultPlayerPositions(),
        ...createInitialDialogState(),
        history: preservedHistory,
        historyByPlayer: preservedHistoryByPlayer,
        mulligans: createInitialMulligans(),
        mulliganDrawn: createInitialMulliganDrawn(),
        events: [],
        eventSeq: 0,
        pendingPatches: [],
        interactionLog: {},
        pendingInteractionId: null,
        acknowledgedInteractionIds: {},
        activeInteraction: null,
        transportSubscriptions: [],
        interactionGuides: false,
        magicGuides: false,
        combatGuideSeatPrefs: { p1: false, p2: false },
        magicGuideSeatPrefs: { p1: false, p2: false },
        combatGuidesActive: false,
        magicGuidesActive: false,
        snapshots: preservedSnapshots,
        pendingMagic: null,
        pendingChaosTwister: null,
        pendingBrowse: null,
        pendingCallToWar: null,
        pendingSearingTruth: null,
        pendingInquisition: null,
        pendingBetrayal: null,
        pendingInfiltrate: null,
        pendingInquisitionSummon: null,
        pendingAccusation: null,
        pendingCommonSense: null,
        pendingCorpseExplosion: null,
        pendingEarthquake: null,
        pendingFeastForCrows: null,
        stolenCards: [],
        activeBetrayals: [],
        activeInfiltrations: [],
        pithImpHands: [],
        processedPithImpReturns: new Set<string>(),
        morganaHands: [],
        omphalosHands: [],
        pendingPrivateHandCast: null,
        pendingAnimistCast: null,
        pendingInterrogatorChoice: null,
        pendingAtlanteanFate: null,
        pendingMephistopheles: null,
        pendingRaiseDead: null,
        pendingLegionOfGall: null,
        pendingAutoResolve: null,
        pendingArtifactCast: null,
        mephistophelesSummonUsed: createInitialMephistophelesSummonUsed(),
        pendingMephistophelesSummon: null,
        pathfinderUsed: createInitialPathfinderUsed(),
        pendingPathfinderPlay: null,
        geomancerRubbleUsed: createInitialGeomancerRubbleUsed(),
        pendingGeomancerPlay: null,
        pendingGeomancerFill: null,
        babelTowers: createInitialBabelTowers(),
        pendingBabelPlacement: null,
        portalState: null,
        seerState: null,
        imposterMasks: createInitialImposterMasks(),
        necromancerSkeletonUsed: createInitialNecromancerSkeletonUsed(),
        harbingerPortalDiscountUsed: { p1: false, p2: false },
        templarDiscountUsed: { p1: false, p2: false },
        etherCoresInVoidAtTurnStart: [],
        coresCarriedAtTurnStart: [],
        druidFlipped: createInitialDruidFlipped(),
        specialSiteState: getEmptySpecialSiteState(),
        headlessHaunts: [],
        merlinInstances: [],
        pendingHeadlessHauntMove: null,
        gemTokens: [],
        gardenOfEdenLocations: {},
        cardsDrawnThisTurn: { p1: 0, p2: 0 },
        pendingRiverGenesis: null,
        pendingObservatory: null,
        pendingKelpCavern: null,
        pendingCrossroads: null,
        pendingPiracy: null,
        pendingShapeshift: null,
        pendingAssimilatorSnail: null,
        assimilatorSnailUsed: createInitialAssimilatorSnailUsed(),
        assimilatorSnailTransforms: [],
        turnEffectQueue: [],
        turnEffectQueueActive: false,
        pendingKettletopLeprechaun: null,
      };
      return reset as GameState;
    }),
});

export const createGameStore = () => create<GameState>(createGameStoreState);

export const useGameStore = createGameStore();
setTransportStateAccessor(useGameStore.getState);
