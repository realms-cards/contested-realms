import { dirToken, handToken, optToken, pileToken, unitToken } from "@/lib/game/cpu/pickTokens";
import { getScript, grantedAbilities } from "@sorcery/shared";
import type { Action, GameState as EngineState } from "@sorcery/shared";
import { engineCellKey } from "./coords";

/**
 * Turns each legal engine action into the sequence of board clicks that picks it:
 * a source (hand card, unit, site), then squares / targets / a labelled option.
 * The UI narrows the legal list by prefix, so it can only ever offer legal moves.
 */
export interface ActionPath {
  action: Action;
  steps: string[];
}

/** First click of a cast from the cemetery: driven by the HUD's cemetery panel, not a board token. */
export const cemToken = (cardId: string): string => `cem:${cardId}`;

/** Engine compass → our board compass under the 180° rotation (engine 'n' is y+1, our board's up). */
const DIR: Record<string, string> = { n: "N", s: "S", e: "W", w: "E" };

/** The board token that stands for an engine object id. */
export function tokenForEngineId(game: EngineState, id: string): string {
  if (id.startsWith("sq:")) {
    const [x, y] = id.slice(3).split(",").map(Number);
    return engineCellKey(x, y);
  }
  const unit = game.units[id];
  if (unit) return unit.isAvatar ? unitToken({ kind: "avatar", seat: unit.owner === 0 ? "p1" : "p2" }) : `unit:perm:${id}`;
  const site = game.sites[id];
  if (site) return engineCellKey(site.x, site.y);
  if (game.artifacts[id] || game.auras[id]) return `unit:perm:${id}`;
  if (game.cards[id]) return handToken("p1", id);
  return `unknown:${id}`;
}

/** The tile a board object sits on, for anchoring option buttons. */
function tileOf(game: EngineState, id: string): string {
  const unit = game.units[id];
  if (unit) return engineCellKey(unit.x, unit.y);
  const site = game.sites[id];
  if (site) return engineCellKey(site.x, site.y);
  const artifact = game.artifacts[id];
  if (artifact) {
    const carrier = artifact.carriedBy ? game.units[artifact.carriedBy] : undefined;
    return carrier ? engineCellKey(carrier.x, carrier.y) : engineCellKey(artifact.x, artifact.y);
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
function abilityLabel(game: EngineState, sourceId: string, key: string): string {
  const name = game.units[sourceId]?.name ?? game.sites[sourceId]?.name ?? game.artifacts[sourceId]?.name;
  const own = name ? getScript(name)?.abilities?.find((a) => a.key === key) : undefined;
  if (own) return own.label;
  const unit = game.units[sourceId];
  const granted = unit ? grantedAbilities(game, unit).find((a) => a.key === key) : undefined;
  return granted?.label ?? key;
}

export function actionPaths(game: EngineState, actions: Action[]): { paths: ActionPath[]; labels: Record<string, string> } {
  const labels: Record<string, string> = {};
  const paths: ActionPath[] = [];
  const opt = (tile: string, id: string, label: string) => {
    const token = optToken(tile, id);
    labels[token] = label;
    return token;
  };

  for (const action of actions) {
    switch (action.t) {
      case "avatarSite": {
        if (action.mode === "draw") paths.push({ action, steps: [pileToken("p1", "atlas")] });
        else paths.push({ action, steps: [handToken("p1", action.cardId), engineCellKey(action.x, action.y)] });
        break;
      }
      case "castSpell": {
        // card (from hand, or the cemetery panel), then its caster (skipped when only the avatar)
        const fromCemetery = game.players[0].cemetery.includes(action.cardId);
        const steps = [fromCemetery ? cemToken(action.cardId) : handToken("p1", action.cardId), tokenForEngineId(game, action.casterId)];
        if (action.at) {
          const tile = engineCellKey(action.at.x, action.at.y);
          const region = action.at.region ?? "surface";
          steps.push(tile, opt(tile, `region-${region}`, REGION_LABEL[region] ?? region));
        }
        const extra = action.extra as { direction?: string; giveTo?: string; origin?: { x: number; y: number } } | undefined;
        // an artifact handed straight to a bearer: pick the unit instead of a square
        if (extra?.giveTo) steps.push(tokenForEngineId(game, extra.giveTo));
        for (const target of action.targets ?? []) {
          const token = tokenForEngineId(game, target);
          steps.push(token);
          // "sq:x,y,region" targets a layer of a square: pick the square, then the layer
          const region = target.startsWith("sq:") ? target.split(",")[2] : undefined;
          if (region) steps.push(opt(token, `region-${region}`, REGION_LABEL[region] ?? region));
        }
        if (extra?.direction) {
          // a projectile flies from the caster; Chaos Twister's blow starts at its origin square
          const from = extra.origin ? engineCellKey(extra.origin.x, extra.origin.y) : tileOf(game, action.casterId);
          steps.push(dirToken(from, DIR[extra.direction] ?? extra.direction));
        }
        paths.push({ action, steps });
        break;
      }
      case "moveAttack": {
        const unit = game.units[action.unitId];
        if (!unit) break;
        const last = action.path[action.path.length - 1] ?? { x: unit.x, y: unit.y, region: unit.region };
        const tile = engineCellKey(last.x, last.y);
        const steps = [tokenForEngineId(game, action.unitId), tile, opt(tile, `region-${last.region}`, REGION_LABEL[last.region] ?? last.region)];
        if (!action.attack) steps.push(opt(tile, "move", "Move here"));
        else if ("unit" in action.attack) steps.push(tokenForEngineId(game, action.attack.unit));
        else steps.push(opt(tile, "attack-site", "Attack the site"));
        paths.push({ action, steps });
        break;
      }
      case "activate": {
        const tile = tileOf(game, action.sourceId);
        const source = tokenForEngineId(game, action.sourceId);
        // the built-in Ranged shot: click the shooter, then a direction arrow
        if (action.ability === "ranged") {
          const direction = (action.extra as { direction?: string } | undefined)?.direction ?? "n";
          paths.push({ action, steps: [source, dirToken(tile, DIR[direction] ?? direction)] });
          break;
        }
        const steps = [source, opt(tile, `ability-${action.ability}`, abilityLabel(game, action.sourceId, action.ability))];
        for (const target of action.targets ?? []) {
          const token = tokenForEngineId(game, target);
          steps.push(token);
          const region = target.startsWith("sq:") ? target.split(",")[2] : undefined;
          if (region) steps.push(opt(token, `region-${region}`, REGION_LABEL[region] ?? region));
        }
        paths.push({ action, steps });
        break;
      }
      case "pickUp": {
        const tile = tileOf(game, action.unitId);
        const carrier = tokenForEngineId(game, action.unitId);
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
        const tile = tileOf(game, action.unitId);
        const carrier = tokenForEngineId(game, action.unitId);
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
  return { paths, labels };
}

export interface Narrowed {
  /** tokens clickable next */
  next: string[];
  /** an action the clicks so far already pick; dispatch it at once when `next` is empty, else offer Confirm */
  done: Action | null;
  /** prefix after auto-advancing through steps that offer only one choice */
  prefix: string[];
}

/** Filter paths by the clicks so far, skipping steps where only one choice remains. */
export function narrow(paths: ActionPath[], clicked: string[]): Narrowed {
  const prefix = [...clicked];
  for (;;) {
    const matching = paths.filter((p) => prefix.every((step, i) => p.steps[i] === step));
    const done = matching.find((p) => p.steps.length === prefix.length)?.action ?? null;
    const next = [...new Set(matching.filter((p) => p.steps.length > prefix.length).map((p) => p.steps[prefix.length]))];
    if (!done && next.length === 1 && prefix.length > 0) {
      prefix.push(next[0]);
      continue;
    }
    return { next, done, prefix };
  }
}
