import { Prisma as PrismaClientNS } from '@prisma/client';
import { generateBooster } from '@/lib/booster';
import type { DraftState } from '@/lib/net/transport';
import { prisma } from '@/lib/prisma';

type DraftCard = {
  id: string;
  name: string;
  cardName?: string;
  slug: string;
  type?: string | null;
  cost?: string | null;
  rarity?: string | null;
  setName?: string;
  [k: string]: unknown;
};

// Local extension to carry opaque engine-managed fields in persisted state
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
    const playerCount = this.session.participants.length;
    this.allGeneratedPacks = Array.from({ length: playerCount }, () => [] as DraftCard[][]);
    for (let r = 0; r < totalRounds; r++) {
      const setName = setSequence[r];
      const roundPacks = await this.generateUniqueRoundPacks(setName, playerCount, 15);
      for (let pi = 0; pi < playerCount; pi++) {
        (this.allGeneratedPacks[pi] as DraftCard[][])[r] = roundPacks[pi];
      }
    }
    console.log(`[TournamentDraftEngine] Generated ${playerCount} x ${totalRounds} unique packs (per round)`);

    // Initialize draft state in pack_selection phase for round 1
    this.draftState = {
      phase: 'pack_selection',
      packIndex: 0,
      pickNumber: 1,
      currentPacks: [],
      picks: this.session.participants.map(() => [] as unknown[]) as unknown[][],
      packDirection: 'left',
      packChoice: this.session.participants.map(() => null),
      waitingFor: this.session.participants.map(p => p.playerId),
    } as DraftStateExtended;
    // Persist the generated packs inside the state JSON (opaque to clients)
    (this.draftState as DraftStateExtended).allGeneratedPacks = this.allGeneratedPacks ?? undefined;

    console.log(`[TournamentDraftEngine] Draft state initialized, waiting for: ${this.draftState.waitingFor.join(', ')}`);

    // Store draft state in session
    {
      const data: PrismaClientNS.DraftSessionUpdateArgs['data'] = {
        status: 'active',
        draftState: JSON.parse(JSON.stringify(this.draftState)) as PrismaClientNS.InputJsonValue,
        startedAt: new Date(),
      };
      await prisma.draftSession.update({ where: { id: this.sessionId }, data });
    }

    return this.draftState;
  }

  /**
   * Generate packs for a specific round
   */
  private async generatePacksForRound(roundIndex: number): Promise<DraftCard[][]> {
    if (!this.session) throw new Error('Session not initialized');

    const playerCount = this.session.participants.length;
    const packConfig = this.session.packConfiguration;

    // Determine which set to use for this round
    const setInfo = this.getSetForRound(roundIndex, packConfig);

    console.log(`[TournamentDraftEngine] Generating round ${roundIndex + 1} packs from set: ${setInfo.setId}`);

    // Generate one pack per player for this round
    const roundPacks: DraftCard[][] = [];
    for (let player = 0; player < playerCount; player++) {
      const pack = await this.generatePack(setInfo.setId, 15); // 15 cards per pack
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
      const picksPerRound = 15; // current pack size; keep in sync with generatePack()
      const expectedTotalBefore = (base.packIndex || 0) * picksPerRound + Math.max(0, (base.pickNumber || 1) - 1);
      const targetTotalThisPick = (base.packIndex || 0) * picksPerRound + (base.pickNumber || 1);

      // If request arrives after the player already picked this turn, treat as idempotent success
      if (!Array.isArray(base.waitingFor) || !base.waitingFor.includes(playerId)) {
        if (currSeatPicks.length >= targetTotalThisPick) {
          return base as DraftState; // already applied
        }
        throw new Error(`Not player ${playerId}'s turn to pick`);
      }
      if (currSeatPicks.length !== expectedTotalBefore) {
        // Player already picked for this pick number or state is out of sync
        throw new Error('Out-of-order or duplicate pick');
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
        const seatP = mergedPicks[idx] as DraftCard[] | undefined;
        const countMerged = Array.isArray(seatP) ? seatP.length : 0;
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
        if (seatPickCount < targetTotalThisPick) {
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
          // Advance round
          const nextRoundIndex = (base.packIndex || 0) + 1;
          const newDirection = base.packDirection === 'left' ? 'right' : 'left';
          nextState = {
            ...base,
            phase: 'pack_selection',
            packIndex: nextRoundIndex,
            pickNumber: 1,
            currentPacks: [],
            packDirection: newDirection,
            waitingFor: participants.map((p) => p.playerId),
            packChoice: participants.map(() => null),
          } as DraftStateExtended;
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
          nextState = {
            ...base,
            pickNumber: (base.pickNumber || 1) + 1,
            currentPacks: passed,
            picks: mergedPicks,
            waitingFor: participants.map((p) => p.playerId),
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
    return resultState;
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

    // Increment pick number
    this.draftState = {
      ...this.draftState,
      pickNumber: this.draftState.pickNumber + 1,
      currentPacks: passedPacks,
      waitingFor: this.session.participants.map(p => p.playerId),
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

    // Alternate direction each round; re-enter pack_selection to let players choose which pack to open this round
    const newDirection = this.draftState.packDirection === 'left' ? 'right' : 'left';

    this.draftState = {
      ...this.draftState,
      phase: 'pack_selection',
      packIndex: nextRoundIndex,
      pickNumber: 1,
      currentPacks: [],
      packDirection: newDirection,
      waitingFor: this.session.participants.map(p => p.playerId),
      packChoice: this.session.participants.map(() => null),
    } as DraftStateExtended;
    // Keep generated packs persisted
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
      return this.draftState;
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
    if (!this.allGeneratedPacks) {
      const dsx = this.draftState as DraftStateExtended;
      if (dsx.allGeneratedPacks) this.allGeneratedPacks = dsx.allGeneratedPacks;
    }
    if (!this.allGeneratedPacks) {
      // Fallback: generate all packs now if missing
      const totalRounds = this.session.packConfiguration.reduce((sum, cfg) => sum + (Number(cfg.packCount) || 0), 0);
      const setSeq: string[] = [];
      for (const cfg of this.session.packConfiguration) {
        for (let i = 0; i < (Number(cfg.packCount) || 0); i++) setSeq.push(cfg.setId);
      }
      const playerCount = this.session.participants.length;
      this.allGeneratedPacks = Array.from({ length: playerCount }, () => [] as DraftCard[][]);
      for (let r = 0; r < totalRounds; r++) {
        const roundPacks = await this.generateUniqueRoundPacks(setSeq[r], playerCount, 15);
        for (let pi = 0; pi < playerCount; pi++) {
          (this.allGeneratedPacks[pi] as DraftCard[][])[r] = roundPacks[pi];
        }
      }
    }
    // Idempotent: if we're no longer in pack_selection (e.g., user reloaded after distribution), just return current state
    if (this.draftState.phase !== 'pack_selection') {
      return this.draftState as DraftState;
    }
    const player = this.session.participants.find(p => p.playerId === playerId);
    if (!player) throw new Error('Player not found');
    const pIdx = player.seatNumber - 1;
    const roundIdx = Math.max(0, Number(this.draftState.packIndex) || 0);
    const playerPacks = this.allGeneratedPacks[pIdx] || [];
    let chosenIdx = typeof opts.packIndex === 'number' ? Math.max(0, Math.min(opts.packIndex, playerPacks.length - 1)) : roundIdx;
    if (opts.setChoice) {
      const found = playerPacks.findIndex((pack) => Array.isArray(pack) && pack[0]?.setName === opts.setChoice);
      if (found >= 0) chosenIdx = found;
    }
    if (chosenIdx !== roundIdx) {
      const tmp = playerPacks[roundIdx];
      playerPacks[roundIdx] = playerPacks[chosenIdx];
      playerPacks[chosenIdx] = tmp;
    }
    const chosenPack = playerPacks[roundIdx] || [];
    const chosenSet = chosenPack[0]?.setName || null;
    const pc: (string | null)[] = Array.isArray((this.draftState as DraftStateExtended).packChoice)
      ? [ ...(this.draftState as DraftStateExtended).packChoice ]
      : this.session.participants.map(() => null);
    pc[pIdx] = chosenSet;
    (this.draftState as DraftStateExtended).packChoice = pc;

    // Auto-finalize: if some players haven't chosen, default them to their current round pack's set
    let allChosen = pc.every((x) => x !== null);
    if (!allChosen) {
      const playerCount = this.session.participants.length;
      for (let idx = 0; idx < playerCount; idx++) {
        if (pc[idx] === null) {
          const fallbackPack = this.allGeneratedPacks?.[idx]?.[roundIdx] ?? [];
          const fallbackSet = fallbackPack[0]?.setName ?? null;
          pc[idx] = fallbackSet;
        }
      }
      allChosen = pc.every((x) => x !== null);
      (this.draftState as DraftStateExtended).packChoice = pc;
    }
    // When all players have chosen (including auto-finalized), distribute packs and enter picking
    if (allChosen) {
      // Ensure uniqueness across players for this round even after choices
      const allPacks = this.allGeneratedPacks ?? [];
      const playerCount = this.session.participants.length;
      const seen = new Set<string>();
      for (let idx = 0; idx < playerCount; idx++) {
        let pack = allPacks[idx]?.[roundIdx] ?? [];
        let sig = this.packSignature(pack);
        let attempts = 0;
        const chosenSetName = (pack[0]?.setName as string | undefined) || (pc[idx] as string | undefined) || 'Beta';
        while (seen.has(sig) && attempts < 30) {
          // Re-roll retaining chosen set
          pack = await this.generatePack(chosenSetName, 15);
          sig = this.packSignature(pack);
          attempts++;
        }
        if (seen.has(sig)) {
          console.warn(`[DraftEngine] Could not re-roll unique pack for seat ${idx + 1} at round ${roundIdx + 1}`);
        }
        seen.add(sig);
        // Persist possibly updated pack back into allGeneratedPacks
        if (this.allGeneratedPacks) {
          (this.allGeneratedPacks[idx] as DraftCard[][])[roundIdx] = pack;
        }
      }
      const distribute = this.session.participants.map((_, idx) => {
        const pack = (this.allGeneratedPacks?.[idx]?.[roundIdx] ?? []) as DraftCard[];
        return [...pack];
      });
      this.draftState = {
        ...this.draftState,
        phase: 'picking',
        currentPacks: distribute,
        waitingFor: this.session.participants.map(p => p.playerId),
      } as DraftStateExtended;
      (this.draftState as DraftStateExtended).allGeneratedPacks = this.allGeneratedPacks ?? undefined;
    }
    await this.saveState();
    return this.draftState as DraftState;
  }

  /**
   * Broadcast state update to all participants (via WebSocket/Server-Sent Events)
   * This should be called after any state change
   */
  async broadcastStateUpdate(): Promise<void> {
    // TODO: Implement WebSocket/SSE broadcasting
    // For now, participants will poll via API
    console.log(`[TournamentDraftEngine] State updated for session ${this.sessionId}`);
  }
}
