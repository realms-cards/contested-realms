import {
  abilityAnchor,
  actingSeatFor,
  applyAction,
  artifactCastPlacements,
  canActivate,
  canCast,
  canExistIn,
  cloneState,
  effKeywords,
  getCard,
  getScript,
  grantedAbilities,
  GRID_H,
  GRID_W,
  legalActions,
  occupiedSquares,
  occupies,
  orthAdjacentWrapped,
  reachableWithPaths,
  resolveCaster,
  siteAt,
  validateSummonAt,
  validateTarget,
} from "../../vendor/untested-realm/shared/src/index";
import type { Action, CardDef, GameState, PlayerId, Region, UnitState } from "../../vendor/untested-realm/shared/src/index";

/**
 * Upstream's move generator (bot/moves.ts expandActions) covers what its bot needs: avatar casts
 * near sites, targetless ability activations, single-artifact pickups. A human can do more, so this
 * widens the list with the same recipe — over-generate candidates, let the engine's own validators
 * and a trial apply keep only what it accepts:
 *  - casts by every legal caster (Spellcaster minions, artifacts, sites), not just the avatar
 *  - minion summons onto granted squares (Harbinger portents), including bare void squares
 *  - minion casts carrying their Genesis targets (anchored at the summon square)
 *  - artifact casts handed straight to a bearer (extra.giveTo)
 *  - casts from the cemetery (castFromCemetery scripts)
 *  - ability activations WITH their targets (the engine takes them up front, no follow-up prompt)
 *  - Ranged projectile shots (the built-in 'ranged' ability)
 *  - carrying units (pickUp/drop with unitIds), multi-artifact pickups, partial drops
 *  - attacks by or on multi-square bodies beyond the anchor square (see oversizedAttacks)
 * Kept in our code so the vendored engine stays pristine.
 *
 * It lives in shared/ rather than src/ because BOTH sides need it. In single-player the client
 * generates its own moves in a worker; in a player-vs-player match the server must, because
 * the generator trial-applies candidates against a full GameState and a client only ever holds
 * a redacted view. The server cannot import from src/ — it is a separate tsc build and a
 * separate image — so a copy there would have rotted against this one.
 *
 * The engine is reached by RELATIVE path, never the `@sorcery/shared` alias: tsc does not
 * rewrite path aliases into the CommonJS the server build emits, so the alias works in the
 * browser bundle and under tsx, and throws `Cannot find module` in the production image.
 */
const REGIONS: Region[] = ["surface", "underground", "underwater"];
/** granted squares can be bare ground — the unit then stands in the void */
const REGIONS_WITH_VOID: Region[] = [...REGIONS, "void"];
const TARGET_COMBO_CAP = 48;
/** a pick anchored to an earlier one (whereOf) multiplies per earlier choice: an ally × its own
 *  nearby squares — give those casts room, or the later allies' destinations are cut off */
const DEPENDENT_COMBO_CAP = 160;
/** genesis combos are PER SUMMON SQUARE — keep each square's slice small or minions explode */
const GENESIS_COMBO_CAP = 6;
/** up to this many artifacts + allies at a location, every Pick Up combination is offered (2^n − 1) */
const PICKUP_COMBO_ITEMS = 5;
/** per-call budget for the extra generation; the base generator has its own pacing */
const EXTRA_BUDGET_MS = 2000;

/** `whereOf` anchors a pick's range to an EARLIER target (Blink: "a location it's nearby" = the ally). */
type TargetSpecLike = { what?: string; count?: number; upTo?: boolean; whereOf?: number };

function accepted(state: GameState, player: PlayerId, action: Action): boolean {
  try {
    return applyAction(cloneState(state), player, action).ok;
  } catch {
    return false;
  }
}

/** Squares on or beside a site: where a Minion/Artifact/Aura might land (trial apply decides). */
function placementSquares(state: GameState): { x: number; y: number }[] {
  const out = new Map<string, { x: number; y: number }>();
  for (const site of Object.values(state.sites)) {
    if (site.isRubble) continue;
    for (const sq of [{ x: site.x, y: site.y }, ...orthAdjacentWrapped(state, site.x, site.y)]) {
      out.set(`${sq.x},${sq.y}`, sq);
    }
  }
  return [...out.values()];
}

/** Granted minion summon squares beyond the usual spots (Harbinger portents): the same
 *  per-unit `extraSummonSquares` sweep canCast runs. Can include bare void squares. */
function extraMinionSquares(state: GameState, player: PlayerId): { x: number; y: number }[] {
  const out = new Map<string, { x: number; y: number }>();
  for (const unit of Object.values(state.units)) {
    if (unit.silenced || unit.controller !== player) continue;
    const extra = getScript(unit.name)?.extraSummonSquares;
    if (extra) for (const sq of extra(state, player)) out.set(`${sq.x},${sq.y}`, { x: sq.x, y: sq.y });
  }
  return [...out.values()];
}

/** Valid target-id combinations for `specs` as seen from `anchor` (mirrors upstream castTargetCombos).
 *  Targets are built IN ORDER and each pick is validated with the picks before it, so a range anchored
 *  to an earlier target (`whereOf` — Blink's "a location it's nearby") is measured from that target,
 *  not from the caster. */
function targetCombos(
  state: GameState,
  me: PlayerId,
  specs: TargetSpecLike[],
  anchor: UnitState,
  cap = TARGET_COMBO_CAP,
  /** the square anchored to a unit is where that unit is SENT (a teleport: Blink) — only offer the
   *  regions it can exist in; the others always fail the trial apply and just cost time */
  destinationOfAnchor = false,
): string[][] {
  type Candidate = { id: string; ref: object };
  const candidates = (spec: TargetSpecLike, picked: object[]): Candidate[] => {
    let raw: Candidate[];
    if (spec.what === "site") {
      raw = Object.values(state.sites).filter((s) => !s.isRubble).map((s) => ({ id: s.id, ref: { site: s.id } }));
    } else if (spec.what === "artifact") {
      raw = Object.values(state.artifacts).map((a) => ({ id: a.id, ref: { artifact: a.id } }));
    } else if (spec.what === "minionOrArtifact") {
      raw = [
        ...Object.values(state.units).filter((u) => !u.carriedBy).map((u) => ({ id: u.id, ref: { unit: u.id } })),
        ...Object.values(state.artifacts).map((a) => ({ id: a.id, ref: { artifact: a.id } })),
      ];
    } else if (spec.what === "square") {
      raw = [];
      for (let x = 0; x < GRID_W; x++)
        for (let y = 0; y < GRID_H; y++)
          for (const region of REGIONS) raw.push({ id: `sq:${x},${y},${region}`, ref: { square: { x, y, region } } });
    } else {
      raw = Object.values(state.units).filter((u) => !u.carriedBy).map((u) => ({ id: u.id, ref: { unit: u.id } }));
    }
    const anchorRef = spec.whereOf != null ? (picked[spec.whereOf] as { unit?: string } | undefined) : undefined;
    const sent = destinationOfAnchor && anchorRef?.unit ? state.units[anchorRef.unit] : undefined;
    const out: Candidate[] = [];
    for (const c of raw) {
      const square = (c.ref as { square?: { x: number; y: number; region: Region } }).square;
      if (sent && square && !canExistIn(state, sent, square.region, square.x, square.y)) continue;
      try {
        if (validateTarget(state, spec as never, c.ref as never, anchor, me, picked as never) === null) out.push(c);
      } catch {
        // not a legal target
      }
    }
    return out;
  };

  const limit = specs.some((spec) => spec.whereOf != null) ? Math.max(cap, DEPENDENT_COMBO_CAP) : cap;
  let combos: Candidate[][] = [[]];
  for (const spec of specs) {
    // an independent pick has the same candidates whatever came before; a dependent one is re-derived
    const shared = spec.whereOf == null ? candidates(spec, []) : null;
    const n = spec.count ?? 1;
    const next: Candidate[][] = [];
    outer: for (const base of combos) {
      const ids = shared ?? candidates(spec, base.map((c) => c.ref));
      const picks: Candidate[][] = spec.upTo ? [[]] : [];
      if (n <= 1) for (const c of ids) picks.push([c]);
      else {
        const pick = (start: number, acc: Candidate[]): void => {
          if (picks.length >= limit) return;
          if (acc.length === n) return void picks.push([...acc]);
          for (let i = start; i < ids.length; i++) pick(i + 1, [...acc, ids[i]]);
        };
        pick(0, []);
      }
      for (const p of picks) {
        next.push([...base, ...p]);
        if (next.length >= limit) break outer;
      }
    }
    combos = next.length ? next : [[]];
  }
  return combos.map((combo) => combo.map((c) => c.id));
}

type Square = { x: number; y: number; region: Region };
type Step = Square;

/** A body covering more than one square (2x2, a rigid or grown body, the Rack). */
export const isMultiSquare = (u: UnitState): boolean => u.size === "2x2" || (u.extraSquares?.length ?? 0) > 0;

/** The squares `u` covers after walking `path`, each with its region — the engine's own step rules
 *  (movement.ts moveUnit): a growing body keeps every square it left, a rigid one shifts with the
 *  anchor, a 2x2 is re-derived from the new anchor. */
export function footprintAfter(u: UnitState, path: readonly Step[]): Square[] {
  const growing = !!getScript(u.name)?.occupiesAllVisited && !u.silenced;
  const body: UnitState = { ...u, extraSquares: u.extraSquares?.map((s) => ({ ...s })) };
  for (const step of path) {
    if (growing) {
      const extra = (body.extraSquares = body.extraSquares ?? []);
      if (!extra.some((s) => s.x === body.x && s.y === body.y)) extra.push({ x: body.x, y: body.y, region: body.region });
    } else if (body.extraSquares?.length) {
      const dx = step.x - body.x;
      const dy = step.y - body.y;
      body.extraSquares = body.extraSquares.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
    }
    body.x = step.x;
    body.y = step.y;
    body.region = step.region;
  }
  return occupiedSquares(body).map((sq) => {
    const extra = body.extraSquares?.find((s) => s.x === sq.x && s.y === sq.y);
    return { ...sq, region: extra?.region ?? body.region };
  });
}

/**
 * WORKAROUND for vendor bot/moves.ts:265-272 (expandActions): attack candidates there are
 * anchor-on-anchor only, while combat.ts accepts any overlap of the two bodies. So a 2x2 / rigid /
 * growing body never attacks an enemy (or site) under its other squares, and nobody attacks an
 * oversized enemy on its non-anchor squares. Same shape as upstream's (`{t, unitId, path, attack}`)
 * so the JSON-key dedupe drops what it already offers. Bounded: only multi-square attackers, plus
 * any attacker when some enemy is multi-square (then only against those), so a normal board pays
 * nothing. Footprints for moves of 2+ may disagree with the BFS (vendor movement.ts:135, V5) —
 * the caller's trial apply settles it.
 */
function oversizedAttacks(state: GameState, me: PlayerId, myUnits: UnitState[]): Action[] {
  const enemies = Object.values(state.units).filter((e) => e.controller !== me && !e.carriedBy);
  const bigEnemies = enemies.filter(isMultiSquare);
  const out: Action[] = [];
  for (const u of myUnits) {
    if (u.tapped) continue;
    const big = isMultiSquare(u);
    if (!big && !bigEnemies.length) continue;
    const targets = big ? enemies : bigEnemies;
    const options: { dest: Step; path: Step[] }[] = [
      { dest: { x: u.x, y: u.y, region: u.region }, path: [] },
      ...reachableWithPaths(state, u),
    ];
    for (const { path } of options) {
      const feet = big ? footprintAfter(u, path) : [path.length ? path[path.length - 1] : { x: u.x, y: u.y, region: u.region }];
      for (const e of targets) {
        if (feet.some((f) => occupies(e, f.x, f.y, f.region))) out.push({ t: "moveAttack", unitId: u.id, path, attack: { unit: e.id } });
      }
      if (!big) continue; // a 1x1 attacker's site is the anchor one upstream already offers
      const sites = new Set<string>();
      for (const f of feet) {
        if (f.region !== "surface") continue;
        const site = siteAt(state, f.x, f.y);
        if (!site || site.controller === null || site.controller === me || site.isRubble || sites.has(site.id)) continue;
        sites.add(site.id);
        out.push({ t: "moveAttack", unitId: u.id, path, attack: { site: site.id } });
      }
    }
  }
  return out;
}

/** Cast candidates for one card and caster. `fromCemetery` only changes where the card sits. */
function castCandidates(
  state: GameState,
  me: PlayerId,
  cardId: string,
  def: CardDef,
  casterId: string,
  caster: UnitState,
  timeUp: () => boolean,
): Action[] {
  const script = getScript(def.name);
  if (def.type === "Magic") {
    const specs = (script?.targets ?? []) as TargetSpecLike[];
    const combos = specs.length ? targetCombos(state, me, specs, caster, TARGET_COMBO_CAP, !!script?.teleportPlacement) : [[]];
    // Chaos Twister consumes the card even without extra.origin/direction (it "fizzles"), so a
    // bare cast is a trap for a human — generate only the real blows, from the minion's square.
    if (script?.shootsProjectile) {
      return combos.flatMap((targets) =>
        (["n", "s", "e", "w"] as const).map(
          (direction): Action => ({ t: "castSpell", cardId, casterId, targets, extra: { direction } }),
        ),
      );
    }
    if (def.name === "Chaos Twister") {
      return combos.flatMap((targets) => {
        const target = state.units[targets[0] ?? ""];
        if (!target) return [];
        return (["n", "s", "e", "w"] as const).map(
          (direction): Action => ({
            t: "castSpell",
            cardId,
            casterId,
            targets,
            extra: { origin: { x: target.x, y: target.y }, direction },
          }),
        );
      });
    }
    return combos.map((targets): Action => ({ t: "castSpell", cardId, casterId, targets }));
  }

  const squares = placementSquares(state);
  if (def.type === "Minion") {
    const granted = extraMinionSquares(state, me);
    const nearSite = new Set(squares.map((sq) => `${sq.x},${sq.y}`));
    const grantedKeys = new Set(granted.map((sq) => `${sq.x},${sq.y}`));
    for (const sq of granted) if (!nearSite.has(`${sq.x},${sq.y}`)) squares.push(sq);
    // Voidwalk (and void hosts like Lucid Dreamers) summon onto ANY void square, so every
    // board square is a candidate for the void layer; validateSummonAt rejects the rest cheaply.
    for (let x = 0; x < GRID_W; x++)
      for (let y = 0; y < GRID_H; y++)
        if (!nearSite.has(`${x},${y}`) && !grantedKeys.has(`${x},${y}`)) squares.push({ x, y });
    const genesisSpecs = (script?.genesisTargets ?? []) as TargetSpecLike[];
    const out: Action[] = [];
    for (const sq of squares) {
      const key = `${sq.x},${sq.y}`;
      const regions = grantedKeys.has(key) ? REGIONS_WITH_VOID : nearSite.has(key) ? REGIONS_WITH_VOID : (["void"] as Region[]);
      for (const region of regions) {
        if (validateSummonAt(state, me, def.name, { ...sq, region }) !== null) continue;
        if (timeUp()) return out;
        // Genesis targets ride in the cast and are measured from where the minion lands.
        if (genesisSpecs.length) {
          const anchor: UnitState = { ...caster, x: sq.x, y: sq.y, region };
          for (const targets of targetCombos(state, me, genesisSpecs, anchor, GENESIS_COMBO_CAP)) {
            out.push(
              targets.length
                ? { t: "castSpell", cardId, casterId, at: { ...sq, region }, targets }
                : { t: "castSpell", cardId, casterId, at: { ...sq, region } },
            );
          }
        } else {
          // no targets: canCast + validateSummonAt already vouch for it — skip the costly trial
          out.push({ t: "castSpell", cardId, casterId, at: { ...sq, region }, __trusted: true } as unknown as Action);
        }
      }
    }
    return out;
  }

  if (def.type === "Artifact") {
    // conjure to a square, or hand it straight to a bearer (the engine lists who may take it)
    const placements = artifactCastPlacements(state, me, def.name);
    return [
      ...squares.map((sq): Action => ({ t: "castSpell", cardId, casterId, at: { ...sq, region: "surface" } })),
      ...placements.giveTo.map((unitId): Action => ({ t: "castSpell", cardId, casterId, extra: { giveTo: unitId } })),
    ];
  }

  return squares.map((sq): Action => ({ t: "castSpell", cardId, casterId, at: { ...sq, region: "surface" } }));
}

/**
 * An attack on a unit that upstream's generator offers (it lists every enemy on the square) but
 * the engine turns down — "only Airborne units can attack an Airborne unit", "that minion has
 * Stealth" — and only once `moveAttack` has already TAPPED the attacker (combat.ts beginAttack).
 * Offered to a human as "Attack <name>", it would spend the unit's turn on nothing. The same two
 * checks the engine's own retarget menu applies (coLocatedAttackTargets).
 */
export function attackRefused(state: GameState, action: Action): boolean {
  if (action.t !== "moveAttack" || !action.attack || !("unit" in action.attack)) return false;
  const attacker = state.units[action.unitId];
  const target = state.units[action.attack.unit];
  if (!attacker || !target) return false;
  const truesight = attacker.carrying.some((id) => getScript(state.artifacts[id]?.name ?? "")?.bearerTruesight);
  if (target.stealth && !truesight) return true;
  return target.region === "surface" && !!effKeywords(state, target).airborne && !effKeywords(state, attacker).airborne;
}

/** Every legal action for `me`: upstream's list plus everything a human can do that it skips. */
/** Candidates the last call skipped because the budget ran out (logged by the legal worker). */
export const legalGenerationStats = { dropped: 0 };

export function legalActionsWithCasters(state: GameState, me: PlayerId): Action[] {
  legalGenerationStats.dropped = 0;
  const base = legalActions(state, me);
  if (state.phase !== "main" || state.prompts.length || actingSeatFor(state, state.activePlayer) !== me) return base;

  // drop upstream casts that would waste the card for a human (see Chaos Twister above), and
  // attacks the engine would refuse only after tapping the attacker (see attackRefused)
  const filtered = base.filter(
    (a) =>
      !(a.t === "castSpell" && state.cards[a.cardId]?.name === "Chaos Twister" && !(a.extra as { origin?: unknown } | undefined)?.origin) &&
      !attackRefused(state, a),
  );

  const deadline = Date.now() + EXTRA_BUDGET_MS;
  const seen = new Set(filtered.map((a) => JSON.stringify(a)));
  const out = [...filtered];
  const timeUp = () => Date.now() > deadline;
  /** `trusted` skips the trial apply: the cheap validators already passed, and a stray
   *  reject at dispatch is harmless (the engine refuses without consuming anything). */
  const offer = (action: Action, trusted = false) => {
    if (timeUp()) {
      legalGenerationStats.dropped++;
      return;
    }
    const key = JSON.stringify(action);
    if (seen.has(key)) return;
    if (trusted || accepted(state, me, action)) {
      seen.add(key);
      out.push(action);
    }
  };

  const avatarId = state.players[me].avatarUnitId;
  const myUnits = Object.values(state.units).filter((u) => u.controller === me && !u.carriedBy);
  const casterIds = [
    avatarId,
    ...myUnits.filter((u) => u.id !== avatarId).map((u) => u.id),
    ...Object.values(state.artifacts)
      .filter((a) => (a.carriedBy ? state.units[a.carriedBy]?.controller === me : a.conjuredBy === me))
      .map((a) => a.id),
    ...Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).map((s) => s.id),
  ];

  // ── attacks by / on multi-square bodies (first: cheap, bounded, and must not flap with the budget) ──
  for (const action of oversizedAttacks(state, me, myUnits)) offer(action);

  // ── casts: hand and cemetery, by every legal caster ──
  const castable: { cardId: string; def: CardDef }[] = [];
  for (const cardId of state.players[me].hand) {
    const def = getCard(state.cards[cardId].name);
    if (def.type !== "Site" && def.type !== "Avatar") castable.push({ cardId, def });
  }
  for (const cardId of state.players[me].cemetery) {
    const name = state.cards[cardId]?.name;
    if (name && getScript(name)?.castFromCemetery) castable.push({ cardId, def: getCard(name) });
  }
  for (const { cardId, def } of castable) {
    if (timeUp()) break;
    for (const casterId of casterIds) {
      if (!canCast(state, me, cardId, casterId).ok) continue;
      const caster = resolveCaster(state, casterId, me);
      if (!caster) continue;
      for (const action of castCandidates(state, me, cardId, def, casterId, caster, timeUp)) {
        const trusted = (action as { __trusted?: boolean }).__trusted === true;
        if (trusted) delete (action as { __trusted?: boolean }).__trusted;
        offer(action, trusted);
      }
      if (timeUp()) break;
    }
  }

  // ── ability activations with their targets (the engine takes targets up front) ──
  const sources: { id: string; name: string }[] = [
    ...myUnits.map((u) => ({ id: u.id, name: u.name })),
    ...Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).map((s) => ({ id: s.id, name: s.name })),
    ...Object.values(state.artifacts)
      .filter((a) => (a.carriedBy ? state.units[a.carriedBy]?.controller === me : a.conjuredBy === me))
      .map((a) => ({ id: a.id, name: a.name })),
  ];
  for (const src of sources) {
    if (timeUp()) break;
    const unit = state.units[src.id];
    const abilities = [...(getScript(src.name)?.abilities ?? []), ...(unit ? grantedAbilities(state, unit) : [])];
    for (const ability of abilities) {
      const specs = (ability.targets ?? []) as TargetSpecLike[];
      if (!specs.length) continue; // targetless ones are already in the base list
      if (canActivate(state, me, src.id, ability.key) !== null) continue;
      const anchor = abilityAnchor(state, src.id, me);
      for (const targets of targetCombos(state, me, specs, anchor)) {
        if (!targets.length) continue;
        offer({ t: "activate", sourceId: src.id, ability: ability.key, targets });
      }
    }
  }

  // ── Ranged shots: the built-in 'ranged' ability, one action per direction ──
  for (const unit of myUnits) {
    if (unit.tapped || !effKeywords(state, unit).ranged) continue;
    for (const direction of ["n", "s", "e", "w"] as const) {
      offer({ t: "activate", sourceId: unit.id, ability: "ranged", extra: { direction } });
    }
  }

  // ── carrying and picking up: unit carries, multi-artifact pickups, partial drops ──
  // Pick Up is once per turn, but that one Pick Up may take any mix of the artifacts and allies at
  // the unit's location at once — so offer every combination (the trial apply keeps the ones the
  // carrier can take: capacity, allowed cargo). A big pile only gets singles and "all artifacts".
  for (const unit of myUnits) {
    if (timeUp()) break;
    const here = myUnits.filter((u) => u.id !== unit.id && u.x === unit.x && u.y === unit.y && u.region === unit.region);
    for (const carried of unit.carryingUnits) offer({ t: "drop", unitId: unit.id, artifactIds: [], unitIds: [carried] });
    const loose = Object.values(state.artifacts).filter(
      (a) => !a.carriedBy && a.x === unit.x && a.y === unit.y && a.region === unit.region,
    );
    const items = [...loose.map((a) => ({ id: a.id, unit: false })), ...here.map((u) => ({ id: u.id, unit: true }))];
    if (items.length <= PICKUP_COMBO_ITEMS) {
      for (let mask = 1; mask < 1 << items.length; mask++) {
        const pick = items.filter((_, i) => mask & (1 << i));
        const unitIds = pick.filter((p) => p.unit).map((p) => p.id);
        offer({
          t: "pickUp",
          unitId: unit.id,
          artifactIds: pick.filter((p) => !p.unit).map((p) => p.id),
          ...(unitIds.length ? { unitIds } : {}),
        });
      }
    } else {
      for (const other of here) offer({ t: "pickUp", unitId: unit.id, artifactIds: [], unitIds: [other.id] });
      if (loose.length > 1) offer({ t: "pickUp", unitId: unit.id, artifactIds: loose.map((a) => a.id) });
    }
    for (const artifactId of unit.carrying) offer({ t: "drop", unitId: unit.id, artifactIds: [artifactId] });
  }

  return out;
}
