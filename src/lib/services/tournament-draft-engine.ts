import { Prisma as PrismaClientNS } from '@prisma/client';
import { generateBooster, generateCubeBoosters } from '@/lib/booster';
import type { DraftState } from '@/lib/net/transport';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/redis';
import type { DraftCard } from '@/types/draft';

interface DraftStateExtended extends DraftState {
  allGeneratedPacks?: DraftCard[][][];
  packChoice: (string | null)[];
}

type DraftSessionData = {
  id: string;
  tournamentId: string;
  packConfiguration: Array<{ setId: string; packCount: number }>;
  settings: {
    timePerPick?: number;
    deckBuildingTime?: number;
    cubeId?: string;
  };
  participants: Array<{
    id: string;
    playerId: string;
    playerName: string;
    seatNumber: number;
    picks: DraftCard[];
  }>;
};

/**
 * Tournament Draft Engine
 * Manages multi-player draft sessions including pack generation,
 * pack passing, state management, and completion detection
 */
export class TournamentDraftEngine {
  private sessionId: string;
  private session: DraftSessionData | null = null;
  private draftState: DraftState | null = null;
  private allGeneratedPacks: DraftCard[][][] | null = null; // [player][round][cards]

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // Compute a canonical signature for a pack (by sorted slug list)
  private packSignature(cards: DraftCard[]): string {
    const slugs = cards.map((c) => String(c.slug)).sort();
    return slugs.join('|');
  }

  // Generate N packs for a round ensuring all packs are different (by signature)
  private async generateUniqueRoundPacks(setName: string, playerCount: number, packSize: number): Promise<DraftCard[][]> {
    // Check if this is a cube draft
    const cubeId = this.session?.settings?.cubeId;
    if (cubeId) {
      // Use cube booster generation
      console.log(`[TournamentDraftEngine] Generating ${playerCount} cube packs from cube ${cubeId}`);
      const boosterPacks = await generateCubeBoosters(cubeId, playerCount, packSize, prisma);

      // Convert BoosterCard format to DraftCard format
      return boosterPacks.map((pack, packIdx) =>
        pack.map((card, cardIdx) => ({
          id: `${card.variantId}_${packIdx}_${cardIdx}`,
          name: card.cardName || '',
          cardName: card.cardName || '',
          slug: card.slug,
          type: card.type,
          cost: null,
          rarity: card.rarity,
          setName: card.setName,
        }))
      );
    }

    // Regular set-based pack generation with uniqueness check
    const result: DraftCard[][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < playerCount; i++) {
      let attempts = 0;
      let pack: DraftCard[] = await this.generatePack(setName, packSize);
      let sig = this.packSignature(pack);
      while (seen.has(sig) && attempts < 30) {
        pack = await this.generatePack(setName, packSize);
        sig = this.packSignature(pack);
        attempts++;
      }
      if (seen.has(sig)) {
        console.warn(`[DraftEngine] Could not guarantee unique pack after ${attempts} attempts for seat ${i + 1} in set ${setName}`);
      }
      seen.add(sig);
      result.push(pack);
    }
    return result;
  }

  /**
   * Lazily load session and draft state from the database into this engine instance.
   * Used when handling API calls (e.g., pick) where the engine instance is ephemeral.
   */
  private async loadSessionAndState(): Promise<void> {
    // Load session including participants
    const session = await prisma.draftSession.findUnique({
      where: { id: this.sessionId },
      include: {
        participants: {
          orderBy: { seatNumber: 'asc' },
          include: { player: { select: { name: true } } },
        },
      },
    });
    if (!session) return;
    const packConfig = session.packConfiguration as Array<{ setId: string; packCount: number }>;
    const settings = (session.settings as Record<string, unknown>) || {};
    this.session = {
      id: session.id,
      tournamentId: session.tournamentId,
      packConfiguration: Array.isArray(packConfig) ? packConfig : [],
      settings: {
        timePerPick: typeof settings.timePerPick === 'number' ? settings.timePerPick : 60,
        deckBuildingTime: typeof settings.deckBuildingTime === 'number' ? settings.deckBuildingTime : 30,
        cubeId: typeof settings.cubeId === 'string' ? settings.cubeId : undefined,
      },
      participants: session.participants.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        playerName: p.player?.name || `Player ${p.seatNumber}`,
        seatNumber: p.seatNumber,
        picks: [],
      })),
    };
    // Load persisted draftState, if present
    try {
      const rawState = (session as unknown as { draftState?: unknown }).draftState;
      const parsed = typeof rawState === 'string'
        ? JSON.parse(rawState as string)
        : rawState;
      if (parsed && typeof parsed === 'object') {
        this.draftState = parsed as DraftState;
        // Also load generated packs if present
        const dsx = this.draftState as DraftStateExtended;
        if (dsx.allGeneratedPacks && !this.allGeneratedPacks) {
          this.allGeneratedPacks = dsx.allGeneratedPacks;
        }
      }
    } catch {
      // leave draftState as null if parse fails
    }
  }

  /**
   * Initialize the draft session and generate packs
   */
  async initialize(): Promise<DraftState> {
    console.log(`[TournamentDraftEngine] Initializing draft session ${this.sessionId}`);

    // Load session data
    const session = await prisma.draftSession.findUnique({
      where: { id: this.sessionId },
      include: {
        participants: {
          include: {
            player: {
              select: { name: true }
            }
          },
          orderBy: { seatNumber: 'asc' }
        }
      }
    });

    if (!session) {
      throw new Error(`Draft session ${this.sessionId} not found`);
    }

    console.log(`[TournamentDraftEngine] Found session with ${session.participants.length} participants`);

    // Parse session data
    const packConfig = session.packConfiguration as Array<{ setId: string; packCount: number }>;
    const settings = (session.settings as Record<string, unknown>) || {};

    this.session = {
      id: session.id,
      tournamentId: session.tournamentId,
      packConfiguration: packConfig,
      settings: {
        timePerPick: typeof settings.timePerPick === 'number' ? settings.timePerPick : 60,
        deckBuildingTime: typeof settings.deckBuildingTime === 'number' ? settings.deckBuildingTime : 30,
        cubeId: typeof settings.cubeId === 'string' ? settings.cubeId : undefined,
      },
      participants: session.participants.map(p => ({
        id: p.id,
        playerId: p.playerId,
        playerName: p.player.name || `Player ${p.seatNumber}`,
        seatNumber: p.seatNumber,
        picks: []
      }))
    };

    // Build set sequence from exact packConfiguration order
    const totalRounds = this.session.packConfiguration.reduce((sum, cfg) => sum + (Number(cfg.packCount) || 0), 0);
    const setSequence: string[] = [];
    for (const cfg of this.session.packConfiguration) {
      const count = Math.max(0, Number(cfg.packCount) || 0);
      for (let i = 0; i < count; i++) setSequence.push(cfg.setId);
    }
    if (setSequence.length !== totalRounds) {
      throw new Error(`Invalid packConfiguration: expected ${totalRounds} rounds, got ${setSequence.length}`);
    }

    console.log(`[TournamentDraftEngine] Generating all packs for ${totalRounds} rounds...`);
    // Pre-generate packs for all rounds per player with uniqueness per round
    const participants = this.session.participants;
    const playerCount = participants.length;
    this.allGeneratedPacks = Array.from({ length: playerCount }, () => [] as DraftCard[][]);
    for (let r = 0; r < totalRounds; r++) {
      const setName = setSequence[r];
      const roundPacks = await this.generateUniqueRoundPacks(setName, playerCount, 15);
      for (let pi = 0; pi < playerCount; pi++) {
        (this.allGeneratedPacks[pi] as DraftCard[][])[r] = roundPacks[pi];
      }
    }
    console.log(`[TournamentDraftEngine] Generated ${playerCount} x ${totalRounds} unique packs (per round)`);

    const roundIdx = 0;
    const fallbackSet = setSequence[roundIdx] || setSequence[0] || 'Beta';
    const currentPacks: DraftCard[][] = Array.from({ length: playerCount }, (_, idx) => {
      const source = this.allGeneratedPacks?.[idx]?.[roundIdx] ?? [];
      return Array.isArray(source) ? source.map((card) => ({ ...card })) : [];
    });
    const waitingFor = currentPacks
      .map((pack, idx) => {
        const participant = participants[idx];
        if (!participant || !Array.isArray(pack) || pack.length === 0) return null;
        return participant.playerId ?? null;
      })
      .filter((id): id is string => Boolean(id));
    const packChoice = participants.map((_participant, idx) => {
      const source = this.allGeneratedPacks?.[idx]?.[roundIdx] ?? [];
      if (Array.isArray(source) && source.length > 0) {
        return source[0]?.setName || fallbackSet;
      }
      return fallbackSet;
    });

    // Start in pack_selection phase so players can choose which pack to open
    this.draftState = {
      phase: 'pack_selection',
      packIndex: roundIdx,
      pickNumber: 1,
      currentPacks,
      picks: this.session.participants.map(() => [] as unknown[]) as unknown[][],
      packDirection: 'left',
      packChoice,
      waitingFor,
    } as DraftStateExtended;
    (this.draftState as DraftStateExtended).allGeneratedPacks = this.allGeneratedPacks ?? undefined;

    {
      const data: PrismaClientNS.DraftSessionUpdateArgs['data'] = {
        status: 'active',
        draftState: JSON.parse(JSON.stringify(this.draftState)) as PrismaClientNS.InputJsonValue,
        startedAt: new Date(),
      };
      await prisma.draftSession.update({ where: { id: this.sessionId }, data });
    }

    console.log(`[TournamentDraftEngine] Draft state initialized, phase=${this.draftState.phase}, waitingFor=${this.draftState.waitingFor.length}`);

    const clientState = await this.sanitizeStateForClients(this.draftState);
    return clientState ?? this.draftState;
  }

  /**
   * Generate packs for a specific round
   */
  private async generatePacksForRound(roundIndex: number): Promise<DraftCard[][]> {
    if (!this.session) throw new Error('Session not initialized');

    const participants = this.session.participants;
    const playerCount = participants.length;
    const packConfig = this.session.packConfiguration;
    const packSize = 15;

    // Determine which set to use for this round
    const setInfo = this.getSetForRound(roundIndex, packConfig);

    console.log(`[TournamentDraftEngine] Generating round ${roundIndex + 1} packs from set: ${setInfo.setId}`);

    // Generate one pack per player for this round
    const roundPacks: DraftCard[][] = [];
    for (let player = 0; player < playerCount; player++) {
      const pack = await this.generatePack(setInfo.setId, packSize);
      roundPacks.push(pack);
    }

    return roundPacks;
  }

  /**
   * Determine which set to use for a given round
   */
  private getSetForRound(roundIndex: number, packConfig: Array<{ setId: string; packCount: number }>): { setId: string } {
    let cumulative = 0;
    for (const config of packConfig) {
      cumulative += config.packCount;
      if (roundIndex < cumulative) {
        return { setId: config.setId };
      }
    }
    return { setId: packConfig[0].setId }; // Fallback to first set
  }

  /**
   * Generate a single booster pack using the standard booster generation
   */
  private async generatePack(setName: string, packSize: number): Promise<DraftCard[]> {
    // Use the same booster generation logic as 2-player drafts
    const boosterCards = await generateBooster(setName, prisma, false);

    // Convert BoosterCard format to DraftCard format
    return boosterCards.slice(0, packSize).map((card, idx) => ({
      id: `${card.variantId}_${idx}`,
      name: card.cardName || '',
      cardName: card.cardName || '',
      slug: card.slug,
      type: card.type,
      cost: null,
      rarity: card.rarity,
      setName,
    }));
  }

  private static buildSetSequenceFromConfig(packConfig: Array<{ setId: string; packCount: number }>): string[] {
    const sequence: string[] = [];
    for (const cfg of packConfig) {
      const count = Math.max(0, Number(cfg.packCount) || 0);
      for (let i = 0; i < count; i++) {
        sequence.push(cfg.setId);
      }
    }
    return sequence;
  }

  private computeSetSequence(): string[] {
    if (!this.session) return [];
    return TournamentDraftEngine.buildSetSequenceFromConfig(this.session.packConfiguration);
  }


  /**
   * Process a player's pick
   */
  async makePick(playerId: string, cardId: string): Promise<DraftState> {
    // Process pick atomically to prevent double-picks and premature passing
    const resultState = await prisma.$transaction(async (tx) => {
      // Acquire a row lock for this DraftSession to serialize concurrent picks and prevent last-write-wins
      await tx.$queryRaw`SELECT id FROM "DraftSession" WHERE id = ${this.sessionId} FOR UPDATE`;
      // Load latest session + state inside the transaction
      const session = await tx.draftSession.findUnique({
        where: { id: this.sessionId },
        include: {
          participants: {
            orderBy: { seatNumber: 'asc' },
            include: { player: { select: { name: true } } },
          },
        },
      });
      if (!session) throw new Error('Draft not initialized');

      const participants = session.participants.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        playerName: p.player?.name || `Player ${p.seatNumber}`,
        seatNumber: p.seatNumber,
      }));

      // Parse current state
      let base: DraftState;
      try {
        const raw = (session as unknown as { draftState?: unknown }).draftState;
        base = (typeof raw === 'string' ? JSON.parse(raw as string) : raw) as DraftState;
      } catch {
        throw new Error('Draft state missing');
      }

      if (!base || base.phase !== 'picking') {
        throw new Error('Not in picking phase');
      }

      const playerRec = participants.find((p) => p.playerId === playerId);
      if (!playerRec) throw new Error(`Player ${playerId} not found in draft`);
      const playerIndex = playerRec.seatNumber - 1;

      // Compute seat totals before enforcing turn guards; support idempotency on duplicate requests
      const currSeatPicks = (base.picks?.[playerIndex] as DraftCard[] | undefined) ?? [];
      const picksPerRound = 15;
      const targetTotalThisPick = (base.packIndex || 0) * picksPerRound + (base.pickNumber || 1);

      // If request arrives after the player already picked this turn, treat as idempotent success
      if (!Array.isArray(base.waitingFor) || !base.waitingFor.includes(playerId)) {
        if (currSeatPicks.length >= targetTotalThisPick) {
          return base as DraftState; // already applied
        }
        throw new Error(`Not player ${playerId}'s turn to pick`);
      }
      // Allow out-of-order recovery: if a duplicate request arrives after the pick was applied, treat as idempotent
      if (currSeatPicks.length >= targetTotalThisPick) {
        return base as DraftState;
      }

      const currentPack = (base.currentPacks?.[playerIndex] as DraftCard[] | undefined) ?? [];
      const cardIdx = currentPack.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) throw new Error(`Card ${cardId} not found in player's pack`);

      const pickedCard = currentPack[cardIdx];
      const updatedPack = [...currentPack.slice(0, cardIdx), ...currentPack.slice(cardIdx + 1)];

      // Merge packs and picks
      const mergedPacks = Array.isArray(base.currentPacks) ? [...base.currentPacks] : [];
      mergedPacks[playerIndex] = updatedPack;
      const mergedPicks = Array.isArray(base.picks) ? [...base.picks] : participants.map(() => [] as DraftCard[]);
      const newSeatPicks = [...currSeatPicks, pickedCard];
      mergedPicks[playerIndex] = newSeatPicks;

      // Recompute waitingFor for current pickNumber across the entire draft,
      // using both mergedPicks and persisted pickData as fallback
      const persistedPickData = await tx.draftParticipant.findMany({
        where: { draftSessionId: this.sessionId },
        select: { seatNumber: true, pickData: true },
        orderBy: { seatNumber: 'asc' },
      });
      const effectiveWaiting: string[] = [];
      for (let idx = 0; idx < participants.length; idx++) {
        const seatPicks = mergedPicks[idx] as DraftCard[] | undefined;
        const countMerged = Array.isArray(seatPicks) ? seatPicks.length : 0;
        const persisted = persistedPickData[idx]?.pickData as unknown;
        let countPersisted = 0;
        if (persisted && typeof persisted === 'object') {
          try {
            const obj = persisted as { picks?: unknown };
            const arr = Array.isArray(obj?.picks) ? (obj.picks as unknown[]) : [];
            countPersisted = arr.length;
          } catch { /* ignore */ }
        }
        const seatPickCount = Math.max(countMerged, countPersisted);
        // If the seat has no pack to pick from, do not wait on them this pick
        const seatPack = mergedPacks[idx] as DraftCard[] | undefined;
        const hasCards = Array.isArray(seatPack) && seatPack.length > 0;
        if (hasCards && seatPickCount < targetTotalThisPick) {
          effectiveWaiting.push(participants[idx].playerId);
        }
      }
      const mergedWaitingFor = effectiveWaiting;

      let nextState: DraftState;
      if (mergedWaitingFor.length === 0) {
        // All players picked -> pass packs atomically in this transaction
        const playerCount = participants.length;
        const allPacksEmpty = (mergedPacks || []).every((pack) => Array.isArray(pack) && pack.length === 0);

        if (allPacksEmpty) {
          // Determine if we have more rounds or if the draft is complete
          const packConfig = (session.packConfiguration as Array<{ setId: string; packCount: number }>) || [];
          const totalRounds = Array.isArray(packConfig)
            ? packConfig.reduce((sum, cfg) => sum + (Number(cfg.packCount) || 0), 0)
            : 0;
          const nextRoundIndex = (base.packIndex || 0) + 1;

          if (nextRoundIndex >= totalRounds) {
            // Draft complete
            nextState = {
              ...base,
              phase: 'complete',
              currentPacks: null,
              picks: mergedPicks,
              waitingFor: [],
            } as DraftStateExtended;
          } else {
            // Advance to next round and immediately distribute packs
            const newDirection = base.packDirection === 'left' ? 'right' : 'left';
            const dsx = base as DraftStateExtended;
            const generated = (Array.isArray(dsx.allGeneratedPacks)
              ? dsx.allGeneratedPacks
              : Array.isArray(this.allGeneratedPacks)
                ? this.allGeneratedPacks
                : []) as DraftCard[][][];
            const sequence = TournamentDraftEngine.buildSetSequenceFromConfig(packConfig);
            const fallbackSet = sequence[nextRoundIndex] || sequence[0] || 'Beta';
            const nextCurrentPacks: DraftCard[][] = participants.map((_, idx) => {
              const source = generated?.[idx]?.[nextRoundIndex] ?? [];
              return Array.isArray(source) ? source.map((card) => ({ ...card })) : [];
            });
            const nextWaiting = nextCurrentPacks
              .map((pack, idx) => (Array.isArray(pack) && pack.length > 0 ? participants[idx].playerId : null))
              .filter((id): id is string => Boolean(id));
            const nextPackChoice = participants.map((_, idx) => {
              const source = generated?.[idx]?.[nextRoundIndex] ?? [];
              if (Array.isArray(source) && source.length > 0) {
                return source[0]?.setName || fallbackSet;
              }
              return fallbackSet;
            });
            // Start next round in pack_selection phase so players can choose packs
            nextState = {
              ...base,
              phase: 'pack_selection',
              packIndex: nextRoundIndex,
              pickNumber: 1,
              currentPacks: nextCurrentPacks,
              picks: mergedPicks,
              packDirection: newDirection,
              waitingFor: nextWaiting,
              packChoice: nextPackChoice,
            } as DraftStateExtended;
            (nextState as DraftStateExtended).allGeneratedPacks = generated;
          }
        } else {
          // Pass packs
          const passed: unknown[][] = [];
          for (let i = 0; i < playerCount; i++) {
            if (base.packDirection === 'left') {
              const from = (i + 1) % playerCount;
              passed[i] = mergedPacks[from];
            } else {
              const from = (i - 1 + playerCount) % playerCount;
              passed[i] = mergedPacks[from];
            }
          }
          // Only require players that actually received a non-empty pack to pick
          const nextWaiting: string[] = [];
          for (let i = 0; i < playerCount; i++) {
            const pack = passed[i] as DraftCard[] | undefined;
            if (Array.isArray(pack) && pack.length > 0) {
              nextWaiting.push(participants[i].playerId);
            }
          }
          nextState = {
            ...base,
            pickNumber: (base.pickNumber || 1) + 1,
            currentPacks: passed,
            picks: mergedPicks,
            waitingFor: nextWaiting,
          };
        }
      } else {
        nextState = {
          ...base,
          currentPacks: mergedPacks,
          picks: mergedPicks,
          waitingFor: mergedWaitingFor,
        };
      }

      // Persist the generated packs pointer if present
      const dsx = nextState as DraftStateExtended;
      if (this.allGeneratedPacks && !dsx.allGeneratedPacks) {
        dsx.allGeneratedPacks = this.allGeneratedPacks;
      }

      // Save state and participant picks inside the same transaction
      {
        const data: PrismaClientNS.DraftSessionUpdateArgs['data'] = {
          draftState: JSON.parse(JSON.stringify(nextState)) as PrismaClientNS.InputJsonValue,
          ...(nextState.phase === 'complete' ? { status: 'completed' as const } : {}),
        };
        await tx.draftSession.update({ where: { id: this.sessionId }, data });
      }
      await tx.draftParticipant.update({
        where: { id: playerRec.id },
        data: {
          pickData: JSON.parse(JSON.stringify({ picks: newSeatPicks })) as PrismaClientNS.InputJsonValue,
          status: 'active',
        },
      });

      return nextState;
    }, { isolationLevel: PrismaClientNS.TransactionIsolationLevel.Serializable });

    this.draftState = resultState;
    const latestGenerated = (this.draftState as DraftStateExtended).allGeneratedPacks;
    if (Array.isArray(latestGenerated)) {
      this.allGeneratedPacks = latestGenerated;
    }
    const safeState = await this.sanitizeStateForClients(resultState);
    return safeState ?? resultState;
  }

  /**
   * Advance to the next pick (pass packs)
   */
  private async advanceToNextPick(): Promise<void> {
    if (!this.draftState || !this.session) return;

    const playerCount = this.session.participants.length;

    // Check if round is complete (all packs empty)
    const allPacksEmpty = (this.draftState.currentPacks || []).every(
      (pack: unknown) => Array.isArray(pack) && pack.length === 0
    );

    if (allPacksEmpty) {
      // Move to next round
      await this.advanceToNextRound();
      return;
    }

    // Pass packs in the appropriate direction
    const direction = this.draftState.packDirection;
    const currentPacks = this.draftState.currentPacks || [];
    const passedPacks: unknown[][] = [];

    for (let i = 0; i < playerCount; i++) {
      if (direction === 'left') {
        // Pass to the left (previous player)
        const fromIndex = (i + 1) % playerCount;
        passedPacks[i] = currentPacks[fromIndex];
      } else {
        // Pass to the right (next player)
        const fromIndex = (i - 1 + playerCount) % playerCount;
        passedPacks[i] = currentPacks[fromIndex];
      }
    }

    // Increment pick number and only wait for seats that received non-empty packs
    const nextWaiting: string[] = [];
    for (let i = 0; i < playerCount; i++) {
      const pack = passedPacks[i] as DraftCard[] | undefined;
      if (Array.isArray(pack) && pack.length > 0) {
        nextWaiting.push(this.session.participants[i].playerId);
      }
    }
    this.draftState = {
      ...this.draftState,
      pickNumber: this.draftState.pickNumber + 1,
      currentPacks: passedPacks,
      waitingFor: nextWaiting,
    };

    await this.saveState();
  }

  /**
   * Advance to the next round
   */
  private async advanceToNextRound(): Promise<void> {
    if (!this.draftState || !this.session) return;

    const nextRoundIndex = this.draftState.packIndex + 1;
    const totalRounds = this.session.packConfiguration.reduce((sum, config) => sum + (Number(config.packCount) || 0), 0);

    if (nextRoundIndex >= totalRounds) {
      // Draft complete!
      await this.completeDraft();
      return;
    }

    const newDirection = this.draftState.packDirection === 'left' ? 'right' : 'left';
    const sequence = this.computeSetSequence();
    const fallbackSet = sequence[nextRoundIndex] || sequence[0] || 'Beta';
    const participants = this.session.participants;
    const playerCount = participants.length;
    const currentPacks: DraftCard[][] = Array.from({ length: playerCount }, (_, idx) => {
      const source = this.allGeneratedPacks?.[idx]?.[nextRoundIndex] ?? [];
      return Array.isArray(source) ? source.map((card) => ({ ...card })) : [];
    });
    const waitingFor = currentPacks
      .map((pack, idx) => {
        const participant = participants[idx];
        if (!participant || !Array.isArray(pack) || pack.length === 0) return null;
        return participant.playerId ?? null;
      })
      .filter((id): id is string => Boolean(id));
    const packChoice = participants.map((_participant, idx) => {
      const source = this.allGeneratedPacks?.[idx]?.[nextRoundIndex] ?? [];
      if (Array.isArray(source) && source.length > 0) {
        return source[0]?.setName || fallbackSet;
      }
      return fallbackSet;
    });

    // Start new round in pack_selection phase so players can choose which pack to open
    this.draftState = {
      ...this.draftState,
      phase: 'pack_selection',
      packIndex: nextRoundIndex,
      pickNumber: 1,
      currentPacks,
      packDirection: newDirection,
      waitingFor,
      packChoice,
    } as DraftStateExtended;
    (this.draftState as DraftStateExtended).allGeneratedPacks = this.allGeneratedPacks ?? undefined;

    await this.saveState();
  }

  /**
   * Complete the draft
   */
  private async completeDraft(): Promise<void> {
    if (!this.draftState) return;

    this.draftState = {
      ...this.draftState,
      phase: 'complete',
      currentPacks: null,
      waitingFor: [],
    };

    // Update session status
    {
      const data: PrismaClientNS.DraftSessionUpdateArgs['data'] = {
        status: 'completed',
        draftState: JSON.parse(JSON.stringify(this.draftState)) as PrismaClientNS.InputJsonValue,
      };
      await prisma.draftSession.update({ where: { id: this.sessionId }, data });
    }

    // Update all participants to completed
    await prisma.draftParticipant.updateMany({
      where: { draftSessionId: this.sessionId },
      data: { status: 'completed' }
    });

    // Persist final picks for each participant into deckData as the authoritative pool
    try {
      const participants = await prisma.draftParticipant.findMany({
        where: { draftSessionId: this.sessionId },
        orderBy: { seatNumber: 'asc' },
        select: { id: true, seatNumber: true },
      });
      const pickMatrix = Array.isArray(this.draftState.picks) ? (this.draftState.picks as unknown[][]) : [];
      const updates = participants.map((dp) => {
        const seatIdx = Math.max(0, (dp.seatNumber || 1) - 1);
        const seatPicks = Array.isArray(pickMatrix[seatIdx]) ? pickMatrix[seatIdx] : [];
        return prisma.draftParticipant.update({
          where: { id: dp.id },
          data: {
            deckData: JSON.parse(JSON.stringify({ picks: seatPicks })) as PrismaClientNS.InputJsonValue,
          },
        });
      });
      await Promise.all(updates);
    } catch (e) {
      try { console.warn('[DraftEngine] Failed to persist final deckData:', (e as Error)?.message || e); } catch {}
    }

    // Broadcast final state for clients listening via sockets
    try { await this.broadcastStateUpdate(); } catch {}
  }

  /**
   * Save current draft state to database
   */
  private async saveState(): Promise<void> {
    if (!this.draftState) return;

    {
      const data: PrismaClientNS.DraftSessionUpdateArgs['data'] = {
        draftState: JSON.parse(JSON.stringify(this.draftState)) as PrismaClientNS.InputJsonValue,
      };
      await prisma.draftSession.update({ where: { id: this.sessionId }, data });
    }
  }

  /**
   * Get current draft state
   */
  async getState(): Promise<DraftState | null> {
    const session = await prisma.draftSession.findUnique({
      where: { id: this.sessionId },
      include: {
        participants: { select: { playerId: true, seatNumber: true }, orderBy: { seatNumber: 'asc' } },
      },
    });

    const hasState = (session && (session as unknown as { draftState?: unknown }).draftState != null);
    if (!hasState) return null;

    // Parse the JSON state back to DraftState and hydrate this instance
    try {
      const raw = (session as unknown as { draftState?: unknown }).draftState;
      const parsed = typeof raw === 'string'
        ? JSON.parse(raw as string)
        : raw;
      this.draftState = parsed as DraftState;
      if (!this.session) {
        // Minimal session hydration for callers that rely on this.session existence
        this.session = {
          id: this.sessionId,
          tournamentId: '',
          packConfiguration: [],
          settings: { timePerPick: 60, deckBuildingTime: 30 },
          participants: (Array.isArray(session.participants) ? session.participants : []).map((p: { playerId: string; seatNumber: number }) => ({
            id: 'n/a',
            playerId: p.playerId,
            playerName: `Player ${p.seatNumber}`,
            seatNumber: p.seatNumber,
            picks: [],
          })),
        };
      }
      // Also load generated packs if present
      const dsx = this.draftState as DraftStateExtended;
      if (dsx.allGeneratedPacks && !this.allGeneratedPacks) {
        this.allGeneratedPacks = dsx.allGeneratedPacks;
      }
      // Self-heal: if we're beyond the configured total rounds, finalize as complete
      try {
        const ds = this.draftState as DraftState;
        const pc = (session.packConfiguration as Array<{ setId: string; packCount: number }>) || [];
        const totalRounds = Array.isArray(pc) ? pc.reduce((s, c) => s + (Number(c.packCount) || 0), 0) : 0;
        if (totalRounds > 0 && ds && ds.packIndex >= totalRounds) {
          this.draftState = { ...ds, phase: 'complete', currentPacks: null, waitingFor: [] };
          await prisma.draftSession.update({
            where: { id: this.sessionId },
            data: {
              status: 'completed',
              draftState: JSON.parse(JSON.stringify(this.draftState)) as PrismaClientNS.InputJsonValue,
            },
          });
          return this.draftState;
        }
      } catch (healErr) {
        console.warn('[DraftEngine] round overflow self-heal skipped:', healErr);
      }

      // Self-heal: if picking and waitingFor looks wrong, recompute from packs+picks
      try {
        const ds = this.draftState as DraftState;
        if (ds && ds.phase === 'picking' && Array.isArray(ds.picks)) {
          const picksPerRound = 15;
          const targetTotalThisPick = (Number(ds.packIndex) || 0) * picksPerRound + (Number(ds.pickNumber) || 1);
          const participants = Array.isArray(session.participants) ? session.participants : [];
          const calcWaiting: string[] = [];
          for (let i = 0; i < participants.length; i++) {
            const seatPack = (ds.currentPacks?.[i] as unknown[]) || [];
            const hasCards = Array.isArray(seatPack) && seatPack.length > 0;
            const seatPicks = (ds.picks?.[i] as unknown[]) || [];
            const seatCount = Array.isArray(seatPicks) ? seatPicks.length : 0;
            if (hasCards && seatCount < targetTotalThisPick) {
              calcWaiting.push(participants[i]?.playerId);
            }
          }

          const current = Array.isArray(ds.waitingFor) ? ds.waitingFor.slice() : [];
          const a = new Set(calcWaiting);
          const b = new Set(current);
          let different = a.size !== b.size;
          if (!different) {
            for (const v of a) { if (!b.has(v)) { different = true; break; } }
          }
          if (different) {
            this.draftState = { ...ds, waitingFor: calcWaiting };
            await this.saveState();
            return this.draftState;
          }
        }
      } catch (healErr) {
        console.warn('[DraftEngine] waitingFor self-heal skipped:', healErr);
      }

      const safeState = await this.sanitizeStateForClients(this.draftState);
      return safeState ?? this.draftState;
    } catch {
      return null;
    }
  }

  /**
   * Player chooses which pre-generated pack to open this round.
   * Swaps chosen pack into the current round index, records choice, and when all chosen, distributes packs and enters picking.
   */
  async choosePack(playerId: string, opts: { packIndex?: number; setChoice?: string }): Promise<DraftState> {
    if (!this.draftState || !this.session) {
      await this.loadSessionAndState();
      if (!this.draftState || !this.session) throw new Error('Draft not initialized');
    }

    const dsx = this.draftState as DraftStateExtended;
    if (!this.allGeneratedPacks && dsx.allGeneratedPacks) {
      this.allGeneratedPacks = dsx.allGeneratedPacks;
    }

    // Find player's seat
    const participant = this.session.participants.find(p => p.playerId === playerId);
    if (!participant) throw new Error('Player not found in draft session');

    const seatIndex = participant.seatNumber;
    const { packIndex, setChoice } = opts;

    // Validate phase
    if (this.draftState.phase !== 'pack_selection') {
      console.warn(`[choosePack] Player ${playerId} tried to choose pack but phase is ${this.draftState.phase}`);
      return this.draftState as DraftState;
    }

    // Validate pack index if provided
    if (typeof packIndex === 'number') {
      if (!this.allGeneratedPacks || !this.allGeneratedPacks[seatIndex] || !this.allGeneratedPacks[seatIndex][packIndex]) {
        console.warn(`[choosePack] Invalid packIndex ${packIndex} for seat ${seatIndex}`);
        return this.draftState as DraftState;
      }

      // Update the current pack for this player
      const chosenPack = this.allGeneratedPacks[seatIndex][packIndex];
      if (this.draftState.currentPacks && Array.isArray(this.draftState.currentPacks[seatIndex])) {
        this.draftState.currentPacks[seatIndex] = chosenPack;
      }
    }

    // Update pack choice for this player
    if (setChoice && Array.isArray(this.draftState.packChoice)) {
      this.draftState.packChoice[seatIndex] = setChoice;
    }

    // Check if all players have chosen their packs
    const allChosen = this.session.participants.every((p, idx) => {
      return this.draftState?.packChoice && this.draftState.packChoice[idx] !== null;
    });

    // Transition to picking phase if everyone has chosen
    if (allChosen) {
      this.draftState.phase = 'picking';
      console.log(`[choosePack] All players chose packs, transitioning to picking phase`);
    }

    // Save updated state
    await prisma.draftSession.update({
      where: { id: this.sessionId },
      data: {
        draftState: JSON.parse(JSON.stringify(this.draftState)) as PrismaClientNS.InputJsonValue,
      },
    });

    console.log(`[choosePack] Player ${playerId} (seat ${seatIndex}) chose pack ${String(packIndex)} with set ${String(setChoice)}`);

    return this.draftState as DraftState;
  }

  /**
   * Broadcast state update to all participants (via WebSocket/Server-Sent Events)
   * This should be called after any state change
   */
  async broadcastStateUpdate(): Promise<void> {
    const safeState = await this.sanitizeStateForClients(this.draftState);

    // Try direct Socket.IO emit first (works for local/single-server deployments)
    try {
      const { getSocket } = await import('@/lib/socket-server');
      const io = getSocket();
      if (io) {
        io.to(`draft:${this.sessionId}`).emit('draftUpdate', safeState);
        console.log(`[TournamentDraftEngine] Direct broadcast to draft:${this.sessionId}`);
      }
    } catch {
      // Socket.IO not available (expected in production with separate socket server)
    }

    // Also publish to Redis for distributed/production deployments
    try {
      await publish('draft:session:update', {
        sessionId: this.sessionId,
        draftState: safeState,
      });
      console.log(`[TournamentDraftEngine] Published to Redis for session ${this.sessionId}`);
    } catch (e) {
      console.warn(`[TournamentDraftEngine] Redis publish failed:`, e);
    }
  }

  private async sanitizeStateForClients(state: DraftState | null): Promise<DraftState | null> {
    if (!state) return state;
    try {
      const participants = await prisma.draftParticipant.findMany({
        where: { draftSessionId: this.sessionId },
        select: { status: true },
      });
      if (participants.length === 0) return state;
      const shouldMask = participants.some((p) => p.status !== 'active');
      if (!shouldMask) return state;
      return {
        ...state,
        currentPacks: null,
      };
    } catch {
      return state;
    }
  }
}
