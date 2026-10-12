import {
  abilityAnchor,
  actingSeatFor,
  applyAction,
  artifactCastPlacements,
  canActivate,
  canCast,
  cloneState,
  effKeywords,
  getCard,
  getScript,
  grantedAbilities,
  GRID_H,
  GRID_W,
  legalActions,
  orthAdjacentWrapped,
  resolveCaster,
  validateSummonAt,
  validateTarget,
} from "@sorcery/shared";
import type { Action, CardDef, GameState, PlayerId, Region, UnitState } from "@sorcery/shared";

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
 * Kept in our code so the vendored engine stays pristine.
 */
const REGIONS: Region[] = ["surface", "underground", "underwater"];
/** granted squares can be bare ground — the unit then stands in the void */
const REGIONS_WITH_VOID: Region[] = [...REGIONS, "void"];
const TARGET_COMBO_CAP = 48;
/** genesis combos are PER SUMMON SQUARE — keep each square's slice small or minions explode */
const GENESIS_COMBO_CAP = 6;
/** per-call budget for the extra generation; the base generator has its own pacing */
const EXTRA_BUDGET_MS = 2000;

type TargetSpecLike = { what?: string; count?: number; upTo?: boolean };

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

/** Valid target-id combinations for `specs` as seen from `anchor` (mirrors upstream castTargetCombos). */
function targetCombos(state: GameState, me: PlayerId, specs: TargetSpecLike[], anchor: UnitState, cap = TARGET_COMBO_CAP): string[][] {
  const candidates = (spec: TargetSpecLike): string[] => {
    let raw: { id: string; ref: object }[];
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
    const out: string[] = [];
    for (const c of raw) {
      try {
        if (validateTarget(state, spec as never, c.ref as never, anchor, me) === null) out.push(c.id);
      } catch {
        // not a legal target
      }
    }
    return out;
  };

  let combos: string[][] = [[]];
  for (const spec of specs) {
    const ids = candidates(spec);
    const n = spec.count ?? 1;
    const picks: string[][] = spec.upTo ? [[]] : [];
    if (n <= 1) for (const id of ids) picks.push([id]);
    else {
      const pick = (start: number, acc: string[]): void => {
        if (picks.length >= cap) return;
        if (acc.length === n) return void picks.push([...acc]);
        for (let i = start; i < ids.length; i++) pick(i + 1, [...acc, ids[i]]);
      };
      pick(0, []);
    }
    const next: string[][] = [];
    outer: for (const base of combos)
      for (const p of picks) {
        next.push([...base, ...p]);
        if (next.length >= cap) break outer;
      }
    combos = next.length ? next : [[]];
  }
  return combos;
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
    const combos = specs.length ? targetCombos(state, me, specs, caster) : [[]];
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

/** Every legal action for `me`: upstream's list plus everything a human can do that it skips. */
export function legalActionsWithCasters(state: GameState, me: PlayerId): Action[] {
  const base = legalActions(state, me);
  if (state.phase !== "main" || state.prompts.length || actingSeatFor(state, state.activePlayer) !== me) return base;

  // drop upstream casts that would waste the card for a human (see Chaos Twister above)
  const filtered = base.filter(
    (a) => !(a.t === "castSpell" && state.cards[a.cardId]?.name === "Chaos Twister" && !(a.extra as { origin?: unknown } | undefined)?.origin),
  );

  const deadline = Date.now() + EXTRA_BUDGET_MS;
  const seen = new Set(filtered.map((a) => JSON.stringify(a)));
  const out = [...filtered];
  const timeUp = () => Date.now() > deadline;
  /** `trusted` skips the trial apply: the cheap validators already passed, and a stray
   *  reject at dispatch is harmless (the engine refuses without consuming anything). */
  const offer = (action: Action, trusted = false) => {
    if (timeUp()) return;
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
  for (const unit of myUnits) {
    if (timeUp()) break;
    const here = myUnits.filter((u) => u.id !== unit.id && u.x === unit.x && u.y === unit.y && u.region === unit.region);
    for (const other of here) offer({ t: "pickUp", unitId: unit.id, artifactIds: [], unitIds: [other.id] });
    for (const carried of unit.carryingUnits) offer({ t: "drop", unitId: unit.id, artifactIds: [], unitIds: [carried] });
    const loose = Object.values(state.artifacts).filter(
      (a) => !a.carriedBy && a.x === unit.x && a.y === unit.y && a.region === unit.region,
    );
    if (loose.length > 1) offer({ t: "pickUp", unitId: unit.id, artifactIds: loose.map((a) => a.id) });
    for (const artifactId of unit.carrying) offer({ t: "drop", unitId: unit.id, artifactIds: [artifactId] });
  }

  return out;
}
