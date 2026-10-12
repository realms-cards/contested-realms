import { getCard } from '../cards/db'
import { getScript } from '../cards/scripts/registry'
import type { DeckList } from './decks'
import type { ClockConfig, GameState, PlayerId, PlayerState, UnitState } from './types'
import { shuffleWithSeed } from './rng'
import { newId, pushLog, drawCards, runSecondSeerPeek, deferTurnStep, registerCont } from './effects'
import { GRID_W } from './grid'

export const STARTING_HAND_SITES = 3
export const STARTING_HAND_SPELLS = 3

export function createGame(
  decks: [DeckList, DeckList],
  names: [string, string],
  seed: number,
  firstPlayer: PlayerId = 0,
  clock: ClockConfig | null = null,
  opts?: { secondSeer?: boolean },
): GameState {
  const state: GameState = {
    version: 0,
    seed,
    turn: 0,
    activePlayer: firstPlayer,
    phase: 'mulligan',
    firstPlayer,
    players: [null as any, null as any],
    cards: {},
    units: {},
    sites: {},
    artifacts: {},
    auras: {},
    prompts: [],
    log: [],
    winner: null,
    nextId: 1,
    clock: clock ? { base: clock.base, inc: clock.inc, remaining: [clock.base, clock.base] } : undefined,
  }

  for (const pid of [0, 1] as PlayerId[]) {
    const deck = decks[pid]
    // bake each card's chosen alternative art (owner's deck.art) onto its instance — cosmetic, and only
    // reaches the opponent for cards they can see (viewFor sends visible instances only).
    const artOf = (n: string) => deck.art?.[n]
    const avatarDef = getCard(deck.avatar)
    const avatarCardId = newId(state, 'c')
    state.cards[avatarCardId] = { id: avatarCardId, name: avatarDef.name, owner: pid, art: artOf(avatarDef.name) }
    const avatarUnitId = newId(state, 'u')
    // avatars start on the middle square of their bottom row (5 wide → x=2)
    const y = pid === 0 ? 0 : 3
    const avatar: UnitState = {
      id: avatarUnitId,
      cardId: avatarCardId,
      name: avatarDef.name,
      owner: pid,
      controller: pid,
      isAvatar: true,
      x: Math.floor(GRID_W / 2),
      y,
      region: 'surface',
      tapped: false,
      damage: 0,
      enteredTurn: 0,
      life: avatarDef.life ?? 20,
      modifiers: [],
      carrying: [],
      carryingUnits: [],
      usedThisTurn: {},
    }
    state.units[avatarUnitId] = avatar

    const spellbook: string[] = []
    for (const [name, copies] of Object.entries(deck.spellbook)) {
      const def = getCard(name)
      for (let i = 0; i < copies; i++) {
        const id = newId(state, 'c')
        state.cards[id] = { id, name: def.name, owner: pid, art: artOf(def.name) }
        spellbook.push(id)
      }
    }
    const atlas: string[] = []
    for (const [name, copies] of Object.entries(deck.atlas)) {
      const def = getCard(name)
      for (let i = 0; i < copies; i++) {
        const id = newId(state, 'c')
        state.cards[id] = { id, name: def.name, owner: pid, art: artOf(def.name) }
        atlas.push(id)
      }
    }
    state.seed = shuffleWithSeed(spellbook, state.seed)
    state.seed = shuffleWithSeed(atlas, state.seed)

    const player: PlayerState = {
      id: pid,
      name: names[pid],
      avatarUnitId,
      atlas,
      spellbook,
      hand: [],
      cemetery: [],
      banished: [],
      collection: { ...(deck.collection ?? {}) },
      mana: 0,
      keptHand: false,
      usedAvatarSiteAbility: false,
    }
    state.players[pid] = player
  }

  // opening hands: 3 sites + 3 spells (avatars may override — Spellslinger, Pathfinder)
  for (const pid of [0, 1] as PlayerId[]) {
    const so = getScript(state.units[state.players[pid].avatarUnitId]?.name ?? '')?.setupDraw
    drawCards(state, pid, 'atlas', so?.sites ?? STARTING_HAND_SITES)
    drawCards(state, pid, 'spellbook', so?.spells ?? STARTING_HAND_SPELLS)
  }
  // avatar setup rules (Harbinger's three squares)
  for (const pid of [0, 1] as PlayerId[]) {
    const hook = getScript(state.units[state.players[pid].avatarUnitId]?.name ?? '')?.onSetup
    if (hook) hook(state, pid)
  }
  pushLog(state, null, 'Both players may mulligan up to 3 cards (to the bottom of their decks), or keep.')
  // "Second Seer" optional rule: the second player gets the Seer avatar's start-of-turn peek on turn 2.
  if (opts?.secondSeer) { state.flow = state.flow ?? {}; state.flow.secondSeer = true }
  return state
}

/** return chosen cards to the bottom of their decks, redraw the same counts */
export function doMulligan(state: GameState, player: PlayerId, back: string[]): string | null {
  const p = state.players[player]
  if (state.phase !== 'mulligan') return 'Mulligans are only allowed before the game starts.'
  if (p.keptHand) return 'You already kept your hand.'
  if (back.length > 3) return 'You may return at most 3 cards.'
  for (const id of back) {
    if (!p.hand.includes(id)) return 'You can only return cards from your hand.'
  }
  // Which deck a returned card goes back to — and is redrawn from — depends on the avatar's deck
  // rules, NOT just the card type. A Magician keeps its sites in the SPELLBOOK and has no drawable
  // atlas (noAtlasDraw), so routing a mulliganed site to the atlas would redraw nothing (the atlas
  // draw no-ops) and shrink the hand to 6. Route each card to the deck it truly belongs to and
  // redraw the same count from that deck, so the hand size is always preserved.
  const sitesInSpellbook = !!getScript(state.units[p.avatarUnitId]?.name ?? '')?.sitesInSpellbook
  const deckOf = (id: string): 'atlas' | 'spellbook' =>
    !sitesInSpellbook && getCard(state.cards[id].name).type === 'Site' ? 'atlas' : 'spellbook'
  let atlasBack = 0
  let spellbookBack = 0
  for (const id of back) {
    p.hand.splice(p.hand.indexOf(id), 1)
    const deck = deckOf(id)
    p[deck].push(id)
    if (deck === 'atlas') atlasBack++
    else spellbookBack++
  }
  if (atlasBack) drawCards(state, player, 'atlas', atlasBack)
  if (spellbookBack) drawCards(state, player, 'spellbook', spellbookBack)
  p.keptHand = true
  pushLog(state, player, `${p.name} mulligans ${back.length} card(s).`)
  maybeStartGame(state)
  return null
}

export function keepHand(state: GameState, player: PlayerId): string | null {
  const p = state.players[player]
  if (state.phase !== 'mulligan') return 'The game already started.'
  if (p.keptHand) return 'You already kept your hand.'
  p.keptHand = true
  pushLog(state, player, `${p.name} keeps their hand.`)
  maybeStartGame(state)
  return null
}

function maybeStartGame(state: GameState): void {
  if (!(state.players[0].keptHand && state.players[1].keptHand)) return
  // "Second Seer" optional rule: the SECOND player gets the Seer's deck-peek ONCE, right here —
  // after both mulligans, BEFORE turn 1 begins. Leave the mulligan phase first (so the board, not
  // the "waiting" overlay, renders the peek prompt), then park the start of turn 1 behind the peek
  // so it fully resolves before the first player acts. No card/avatar-script coupling.
  if (state.flow?.secondSeer) {
    state.phase = 'start'
    state.activePlayer = state.firstPlayer
    runSecondSeerPeek(state, (1 - state.firstPlayer) as PlayerId)
  }
  if (state.prompts.length) deferTurnStep(state, 'setup:beginFirstTurn', { player: state.firstPlayer })
  else beginTurn(state, state.firstPlayer)
}
registerCont('setup:beginFirstTurn', (state, ctx: { player: PlayerId }) => beginTurn(state, ctx.player))

/** start phase; imported here to avoid a turn.ts↔setup.ts cycle, defined in turn.ts */
import { beginTurn } from './turn'
