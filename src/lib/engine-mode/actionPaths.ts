import { dirToken, handToken, optToken, pileToken, unitToken } from "@/lib/game/cpu/pickTokens";
import { getCard, getScript, grantedAbilities } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId, UnitState } from "@sorcery/shared";
import { footprintAfter } from "@shared/engine/casterActions";
import { BOARD_DIRECTIONS, ENGINE_DIRECTIONS, type EngineDirection, engineCellKey, type ViewerSeat } from "./coords";
import { footprintCell, seatKey, unitCell } from "./projection";

/**
 * Turns each legal engine action into the sequence of board clicks that picks it:
 * a source (hand card, unit, site), then squares / targets / a labelled option.
 * The UI narrows the legal list by prefix, so it can only ever offer legal moves.
 */
export interface ActionPath {
  action: Action;
  steps: string[];
  /**
   * Step token -> the board cells that step stands for, when it is an AREA rather than one
   * square: a multi-square body's destination is keyed on one cell of its footprint, and the
   * picker lights the whole footprint (see `pathAreas`).
   */
  areas?: Record<string, string[]>;
  /**
   * A step index `narrow` must not skip over even when it is the only choice left: the
   * player sees the labelled option and clicks it. A hand card's ability (Slimy Mutants)
   * started from the card itself would otherwise fire — and spend its mana — on the very
   * click that only picked the card.
   */
  hold?: number;
}

/** The hand cards whose `handAbilities` provide this ability key (they surface on the owner's avatar). */
function handAbilityCards(game: EngineState, avatarId: string, ability: string): string[] {
  const avatar = game.units[avatarId];
  if (!avatar?.isAvatar) return [];
  const owner = avatar.controller;
  const out: string[] = [];
  for (const cardId of game.players[owner]?.hand ?? []) {
    const name = game.cards[cardId]?.name;
    const provides = name ? getScript(name)?.handAbilities : undefined;
    if (!provides) continue;
    try {
      if (provides(game, cardId, owner).some((a) => a.key === ability)) out.push(cardId);
    } catch {
      // a script that cannot describe itself here simply gets no hand path
    }
  }
  return out;
}

/**
 * The areas behind the tokens offered at `depth` (the next click) among `matching` paths, ready
 * for the board picker's `setAreas`: each token lights its footprint under the pointer.
 */
export function pathAreas(matching: readonly ActionPath[], depth: number): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const path of matching) {
    const token = path.steps[depth];
    const cells = token ? path.areas?.[token] : undefined;
    if (cells && !out[token]) out[token] = cells;
  }
  return out;
}

/** The minion an Enchantress animated out of this aura, if it is animated right now. */
function animatedBy(game: EngineState, auraId: string): UnitState | undefined {
  return Object.values(game.units).find((unit) => unit.counters?.animatedAura !== undefined && String(unit.counters.animatedAura) === auraId);
}

/** First click of a cast from the cemetery: driven by the HUD's cemetery panel, not a board token. */
export const cemToken = (cardId: string): string => `cem:${cardId}`;

const isEngineDirection = (dir: string): dir is EngineDirection =>
  (ENGINE_DIRECTIONS as readonly string[]).includes(dir);

/** Engine compass → the arrow the viewer sees; anything that is not a compass word is left as it is. */
const boardDir = (dir: string, viewer: ViewerSeat): string =>
  isEngineDirection(dir) ? BOARD_DIRECTIONS[viewer][dir] : dir;

/** The board token that stands for an engine object id. */
/** `seat` is whose cards these are — normally the human, but the opponent's while a
 *  Courtesan Thaïs turn is being piloted. `viewer` is the seat the board is drawn for, which
 *  is what decides both the square and which side of the table a card belongs to. Both are
 *  optional so every existing caller is unaffected. */
export function tokenForEngineId(game: EngineState, id: string, seat: PlayerId = 0, viewer: ViewerSeat = 0): string {
  if (id.startsWith("sq:")) {
    const [x, y] = id.slice(3).split(",").map(Number);
    return engineCellKey(x, y, viewer);
  }
  const unit = game.units[id];
  if (unit) return unit.isAvatar ? unitToken({ kind: "avatar", seat: seatKey(unit.owner, viewer) }) : `unit:perm:${id}`;
  const site = game.sites[id];
  if (site) return engineCellKey(site.x, site.y, viewer);
  const artifact = game.artifacts[id];
  if (artifact) {
    // A CARRIED artifact is drawn as a small attachment on its bearer and is skipped by
    // PermanentStack's main loop (`if (p.attachedTo) return null`), so it never gets a pick
    // token of its own — `unit:perm:<artifactId>` would be unclickable and the Toolbox could
    // never be activated. Anchor it on the bearer instead; the ability's own option button
    // then names which carried thing is being used.
    const bearer = artifact.carriedBy ? game.units[artifact.carriedBy] : undefined;
    if (bearer) {
      return bearer.isAvatar
        ? unitToken({ kind: "avatar", seat: seatKey(bearer.owner, viewer) })
        : `unit:perm:${bearer.id}`;
    }
    return `unit:perm:${id}`;
  }
  if (game.auras[id]) {
    // an animated aura is drawn as its minion (the projection shows that card, not the aura)
    const minion = animatedBy(game, id);
    return `unit:perm:${minion?.id ?? id}`;
  }
  if (game.cards[id]) return handToken(seatKey(seat, viewer), id);
  return `unknown:${id}`;
}

/** The tile a board object sits on, for anchoring option buttons. */
function tileOf(game: EngineState, id: string, viewer: ViewerSeat = 0): string {
  const unit = game.units[id];
  if (unit) return unitCell(unit, viewer);
  const site = game.sites[id];
  if (site) return engineCellKey(site.x, site.y, viewer);
  const artifact = game.artifacts[id];
  if (artifact) {
    const carrier = artifact.carriedBy ? game.units[artifact.carriedBy] : undefined;
    return carrier ? unitCell(carrier, viewer) : engineCellKey(artifact.x, artifact.y, viewer);
  }
  return "2,2";
}

const REGION_LABEL: Record<string, string> = {
  surface: "On the surface",
  underground: "Burrowed",
  underwater: "Submerged",
  void: "In the void",
};

/** Ability label for a source; falls back to the key. */
/** The ability's label, prefixed with the carried artifact's name when it is not the bearer's own. */
function activateLabel(game: EngineState, sourceId: string, key: string): string {
  const label = abilityLabel(game, sourceId, key);
  const artifact = game.artifacts[sourceId];
  if (!artifact?.carriedBy) return label;
  return label.toLowerCase().includes(artifact.name.toLowerCase()) ? label : `${artifact.name}: ${label}`;
}

function abilityLabel(game: EngineState, sourceId: string, key: string): string {
  const name = game.units[sourceId]?.name ?? game.sites[sourceId]?.name ?? game.artifacts[sourceId]?.name;
  const own = name ? getScript(name)?.abilities?.find((a) => a.key === key) : undefined;
  if (own) return own.label;
  const unit = game.units[sourceId];
  const granted = unit ? grantedAbilities(game, unit).find((a) => a.key === key) : undefined;
  return granted?.label ?? key;
}

/**
 * A short phrase for what clicking this token will do, shown as a hover tooltip.
 *
 * Written from the acting player's point of view and kept to a few words: the board already
 * shows WHERE, so this only has to say WHAT. Tile numbers rather than coordinates, because
 * coordinates do not exist in the game.
 */
export function actionHint(game: EngineState, action: Action): string {
  const name = (id: string | undefined) =>
    (id && (game.units[id]?.name ?? game.sites[id]?.name ?? game.artifacts[id]?.name ?? game.cards[id]?.name)) || "it";
  switch (action.t) {
    case "avatarSite":
      return action.mode === "draw" ? "Draw a site" : `Play ${name(action.cardId)}`;
    case "castSpell": {
      const card = game.cards[action.cardId]?.name;
      const def = card ? getCard(card) : undefined;
      if (!def) return "Cast it";
      return def.type === "Magic" ? `Cast ${def.name}` : `Summon ${def.name}`;
    }
    case "moveAttack": {
      const who = name(action.unitId);
      if ("unit" in (action.attack ?? {})) return `${who} attacks`;
      if (action.attack && "site" in action.attack) return `${who} attacks the site`;
      return `Move ${who}`;
    }
    case "activate":
      return activateLabel(game, action.sourceId, action.ability);
    case "pickUp":
      return action.artifactIds.length === 1 ? `Pick up ${name(action.artifactIds[0])}` : "Pick these up";
    case "drop":
      return action.artifactIds.length === 1 ? `Drop ${name(action.artifactIds[0])}` : "Drop these";
    case "endTurn":
      return "End the turn";
    default:
      return "Take this action";
  }
}

export function actionPaths(
  game: EngineState,
  actions: Action[],
  seat: PlayerId = 0,
  viewer: ViewerSeat = 0,
): { paths: ActionPath[]; labels: Record<string, string> } {
  const key = seatKey(seat, viewer);
  const labels: Record<string, string> = {};
  const paths: ActionPath[] = [];
  /** summon click-paths already emitted, so the same clicks never mean two different casters */
  const summonSteps = new Set<string>();
  /** hand tokens that start a hand card's ability (see the `activate` case) */
  const handAbilityStarts = new Set<string>();
  const opt = (tile: string, id: string, label: string) => {
    const token = optToken(tile, id);
    labels[token] = label;
    return token;
  };
  /**
   * An animated aura and its minion are one card on the board, so both resolve to the minion's
   * token. Where ONE card or ability can target either (a dispel that may hit the minion or the
   * aura), the click alone cannot tell them apart: a labelled option after the card does. Kept
   * per source, so an unrelated spell that targets only one of them asks nothing extra.
   */
  const sourceOf = (action: Action): string | null =>
    action.t === "castSpell" ? `cast:${action.cardId}` : action.t === "activate" ? `act:${action.sourceId}:${action.ability}` : null;
  const targetsBySource = new Map<string, Set<string>>();
  for (const action of actions) {
    const source = sourceOf(action);
    if (!source || (action.t !== "castSpell" && action.t !== "activate")) continue;
    const ids = targetsBySource.get(source) ?? new Set<string>();
    for (const target of action.targets ?? []) ids.add(target);
    targetsBySource.set(source, ids);
  }
  const twoWayBySource = new Map<string, Set<string>>();
  for (const [source, ids] of targetsBySource) {
    const twoWay = new Set<string>();
    for (const id of ids) {
      const minion = game.auras[id] ? animatedBy(game, id) : undefined;
      if (minion && ids.has(minion.id)) twoWay.add(id).add(minion.id);
    }
    if (twoWay.size) twoWayBySource.set(source, twoWay);
  }
  const targetSteps = (target: string, source: Action): string[] => {
    const token = tokenForEngineId(game, target, seat, viewer);
    // "sq:x,y,region" targets a layer of a square: pick the square, then the layer
    const region = target.startsWith("sq:") ? target.split(",")[2] : undefined;
    if (region) return [token, opt(token, `region-${region}`, REGION_LABEL[region] ?? region)];
    const key = sourceOf(source);
    if (!key || !twoWayBySource.get(key)?.has(target)) return [token];
    const asAura = Boolean(game.auras[target]);
    const name = (asAura ? game.auras[target]?.name : game.units[target]?.name) ?? "it";
    // The option row hangs on a TILE (the board only draws tile-anchored rows): the card's own
    // cell, which is the minion's for both ids.
    const minionId = asAura ? (animatedBy(game, target)?.id ?? target) : target;
    const tile = tileOf(game, minionId, viewer);
    return [token, opt(tile, `as-${asAura ? "aura" : "minion"}-${target}`, `${name} as ${asAura ? "an aura" : "a minion"}`)];
  };

  /**
   * Attacks a unit can make WITHOUT moving (the engine's empty-path moveAttack): an enemy on its
   * own square, or the site it stands on. The full click path for these runs through the unit's
   * own tile — which the unit itself covers on the board — so each also gets a labelled option
   * right after the unit, on the same row as its abilities: "Attack <target>". When two targets
   * share a name a label cannot tell them apart, so the row says "Attack here" and the target is
   * then picked on the board.
   */
  const attacksHere = new Map<string, { action: Action; target: string; name: string }[]>();
  for (const action of actions) {
    if (action.t !== "moveAttack" || !action.attack || action.path.length) continue;
    const target = "unit" in action.attack ? action.attack.unit : action.attack.site;
    const name = ("unit" in action.attack ? game.units[target]?.name : game.sites[target]?.name) ?? "it";
    const list = attacksHere.get(action.unitId) ?? [];
    if (!list.some((a) => a.target === target)) list.push({ action, target, name });
    attacksHere.set(action.unitId, list);
  }
  const attackHereSteps = (unitId: string, target: string): string[] | null => {
    const list = attacksHere.get(unitId);
    const entry = list?.find((a) => a.target === target);
    if (!list || !entry) return null;
    const tile = tileOf(game, unitId, viewer);
    const distinct = new Set(list.map((a) => a.name)).size === list.length;
    if (distinct) return [tokenForEngineId(game, unitId, seat, viewer), opt(tile, `attack-here-${target}`, `Attack ${entry.name}`)];
    const here = opt(tile, "attack-here", "Attack here");
    // a unit is picked by its own card; the site under the attacker by a labelled option
    const pick = game.units[target] ? tokenForEngineId(game, target, seat, viewer) : opt(tile, `attack-site-${target}`, `Attack ${entry.name}`);
    return [tokenForEngineId(game, unitId, seat, viewer), here, pick];
  };

  for (const action of actions) {
    switch (action.t) {
      case "avatarSite": {
        if (action.mode === "draw") paths.push({ action, steps: [pileToken(key, "atlas")] });
        else paths.push({ action, steps: [handToken(key, action.cardId), engineCellKey(action.x, action.y, viewer)] });
        break;
      }
      case "castSpell": {
        // Card first (from hand, or the cemetery panel), then — for a MAGIC — its caster.
        //
        // A summon does NOT ask which spellcaster casts it. Where a minion may be placed
        // already accounts for every caster's reach, so the squares on offer are the whole
        // answer: making the player choose a caster first only hides half of them behind an
        // extra click. A Magic keeps the step, because which caster resolves it can matter.
        const fromCemetery = game.players[seat].cemetery.includes(action.cardId);
        const cardDef = getCard(game.cards[action.cardId]?.name ?? "");
        const picksCaster = cardDef?.type === "Magic";
        const steps = [fromCemetery ? cemToken(action.cardId) : handToken(key, action.cardId)];
        if (picksCaster) steps.push(tokenForEngineId(game, action.casterId, seat, viewer));
        if (action.at) {
          const tile = engineCellKey(action.at.x, action.at.y, viewer);
          const region = action.at.region ?? "surface";
          steps.push(tile, opt(tile, `region-${region}`, REGION_LABEL[region] ?? region));
        }
        const extra = action.extra as { direction?: string; giveTo?: string; origin?: { x: number; y: number } } | undefined;
        // an artifact handed straight to a bearer: pick the unit instead of a square
        if (extra?.giveTo) steps.push(tokenForEngineId(game, extra.giveTo, seat, viewer));
        for (const target of action.targets ?? []) steps.push(...targetSteps(target, action));
        if (extra?.direction) {
          // a projectile flies from the caster; Chaos Twister's blow starts at its origin square
          const from = extra.origin
            ? engineCellKey(extra.origin.x, extra.origin.y, viewer)
            : tileOf(game, action.casterId, viewer);
          steps.push(dirToken(from, boardDir(extra.direction, viewer)));
        }
        // Without the caster step, two spellcasters able to summon the same minion to the same
        // square produce the SAME sequence of clicks. Keep one: offering both would make the
        // click path ambiguous and `narrow` would pick between them arbitrarily. The one kept
        // is a caster the engine itself offered for that square, so the summon is legal.
        if (!picksCaster) {
          const fingerprint = steps.join(">");
          if (summonSteps.has(fingerprint)) break;
          summonSteps.add(fingerprint);
        }
        paths.push({ action, steps });
        break;
      }
      case "moveAttack": {
        const unit = game.units[action.unitId];
        if (!unit) break;
        const last = action.path[action.path.length - 1] ?? { x: unit.x, y: unit.y, region: unit.region };

        // A multi-square body's destination is the AREA it would cover: keyed on that area's cell
        // nearest its centre (where its card will be drawn) and published as an area, so the
        // board marks the footprint's centre and lights all of it on hover. A bare corner tile,
        // often inside the body it is leaving, read as "stay put". The footprint walks the
        // engine's own step rules, so a growing moeba keeps every square it leaves. Avatars are
        // drawn on their anchor (see unitCell), so a Racked avatar keeps a plain square.
        const feet = unit.isAvatar ? [] : footprintAfter(unit, action.path);
        const body = feet.length > 1 ? feet : null;
        const tile = (body && footprintCell(body, viewer)) ?? engineCellKey(last.x, last.y, viewer);
        const steps = [tokenForEngineId(game, action.unitId, seat, viewer), tile, opt(tile, `region-${last.region}`, REGION_LABEL[last.region] ?? last.region)];
        if (!action.attack) steps.push(opt(tile, "move", "Move here"));
        else if ("unit" in action.attack) steps.push(tokenForEngineId(game, action.attack.unit, seat, viewer));
        else if (!body) steps.push(opt(tile, "attack-site", "Attack the site"));
        else {
          // a body over several sites can strike any of them: name the one this is
          const site = game.sites[action.attack.site];
          steps.push(opt(tile, `attack-site-${action.attack.site}`, site ? `Attack ${site.name}` : "Attack the site"));
        }
        paths.push(body ? { action, steps, areas: { [tile]: body.map((sq) => engineCellKey(sq.x, sq.y, viewer)) } } : { action, steps });
        if (action.attack && !action.path.length) {
          const target = "unit" in action.attack ? action.attack.unit : action.attack.site;
          const here = attackHereSteps(action.unitId, target);
          if (here) paths.push({ action, steps: here });
        }
        break;
      }
      case "activate": {
        const tile = tileOf(game, action.sourceId, viewer);
        const source = tokenForEngineId(game, action.sourceId, seat, viewer);
        // the built-in Ranged shot: click the shooter, then a direction arrow
        if (action.ability === "ranged") {
          const direction = (action.extra as { direction?: string } | undefined)?.direction ?? "n";
          paths.push({ action, steps: [source, dirToken(tile, boardDir(direction, viewer))] });
          break;
        }
        // Keyed on the SOURCE as well as the ability: a bearer can carry several artifacts,
        // and two of them may use the same ability key. The label names the carried thing so
        // the player can tell which one the button fires.
        const steps = [
          source,
          opt(tile, `ability-${action.sourceId}-${action.ability}`, activateLabel(game, action.sourceId, action.ability)),
        ];
        for (const target of action.targets ?? []) steps.push(...targetSteps(target, action));
        paths.push({ action, steps });
        // A carried artifact starts on its bearer (see tokenForEngineId); where the board draws it
        // as a card of its own (the 2D attachments), it can be started from the artifact too,
        // then the same option, held for a click so the label shows before anything is spent.
        if (game.artifacts[action.sourceId]?.carriedBy) {
          paths.push({ action, steps: [`unit:perm:${action.sourceId}`, ...steps.slice(1)], hold: 1 });
        }
        // A hand card's ability is surfaced on its owner's avatar; it can be started from the
        // card itself too, then the same option and targets. The option is held for a click.
        const avatar = game.units[action.sourceId];
        for (const cardId of handAbilityCards(game, action.sourceId, action.ability)) {
          const owner = avatar?.controller === 1 ? "p2" : "p1";
          paths.push({ action, steps: [handToken(owner, cardId), ...steps.slice(1)], hold: 1 });
          handAbilityStarts.add(handToken(owner, cardId));
        }
        break;
      }
      case "pickUp": {
        const tile = tileOf(game, action.unitId, viewer);
        const carrier = tokenForEngineId(game, action.unitId, seat, viewer);
        if (action.unitIds?.length) {
          const names = action.unitIds.map((id) => game.units[id]?.name ?? "unit").join(", ");
          paths.push({ action, steps: [carrier, opt(tile, `carry-${action.unitIds.join("+")}`, `Carry ${names}`)] });
          break;
        }
        const names = action.artifactIds.map((id) => game.artifacts[id]?.name ?? "artifact").join(", ");
        paths.push({ action, steps: [carrier, opt(tile, `pickup-${action.artifactIds.join("+")}`, `Pick up ${names}`)] });
        break;
      }
      case "drop": {
        const tile = tileOf(game, action.unitId, viewer);
        const carrier = tokenForEngineId(game, action.unitId, seat, viewer);
        if (action.unitIds?.length) {
          const names = action.unitIds.map((id) => game.units[id]?.name ?? "unit").join(", ");
          paths.push({ action, steps: [carrier, opt(tile, `dropu-${action.unitIds.join("+")}`, `Set down ${names}`)] });
          break;
        }
        const names = action.artifactIds.map((id) => game.artifacts[id]?.name ?? "artifact").join(", ");
        paths.push({ action, steps: [carrier, opt(tile, `drop-${action.artifactIds.join("+")}`, `Drop ${names}`)] });
        break;
      }
      default:
        // endTurn, mulligan, prompts: driven by buttons and the prompt panel, not board clicks
        break;
    }
  }
  // A hand card that can be both played and used for its hand ability means two things on one
  // click. Put a labelled choice right after the card — "Cast …" beside the ability's own label,
  // on the same row by the avatar — so the player says which before anything else is lit.
  for (const start of handAbilityStarts) {
    const cardId = start.slice(start.indexOf(":", "hand:".length) + 1);
    const plays = paths.filter((p) => p.steps[0] === start && p.hold === undefined);
    if (!plays.length) continue;
    const avatarId = game.players[seat]?.avatarUnitId;
    const tile = avatarId && game.units[avatarId] ? tileOf(game, avatarId, viewer) : "2,2";
    const name = game.cards[cardId]?.name ?? "it";
    for (const path of plays) {
      const label = path.action.t === "avatarSite" ? `Play ${name}` : `Cast ${name}`;
      const choice = opt(tile, `${path.action.t === "avatarSite" ? "play" : "cast"}-${cardId}`, label);
      path.steps = [path.steps[0], choice, ...path.steps.slice(1)];
    }
  }
  return { paths, labels };
}

export interface Narrowed {
  /** tokens clickable next */
  next: string[];
  /** an action the clicks so far already pick; dispatch it at once when `next` is empty, else offer Confirm */
  done: Action | null;
  /** prefix after auto-advancing through steps that offer only one choice */
  prefix: string[];
  /** the paths still live after the clicks so far, so a caller can describe each next token */
  matching: ActionPath[];
}

/** Filter paths by the clicks so far, skipping steps where only one choice remains. */
export function narrow(paths: ActionPath[], clicked: string[]): Narrowed {
  const prefix = [...clicked];
  for (;;) {
    const matching = paths.filter((p) => prefix.every((step, i) => p.steps[i] === step));
    const done = matching.find((p) => p.steps.length === prefix.length)?.action ?? null;
    const next = [...new Set(matching.filter((p) => p.steps.length > prefix.length).map((p) => p.steps[prefix.length]))];
    // a held step (see ActionPath.hold) waits for its click even when it is the only choice
    const held = matching.some((p) => p.hold === prefix.length && p.steps.length > prefix.length);
    if (!done && next.length === 1 && prefix.length > 0 && !held) {
      prefix.push(next[0]);
      continue;
    }
    return { next, done, prefix, matching };
  }
}
