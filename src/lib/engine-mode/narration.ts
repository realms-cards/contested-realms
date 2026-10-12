import type { CpuReveal, CpuRevealKind } from "@/lib/game/cpu/revealQueue";
import { getCard, getScript, grantedAbilities } from "@sorcery/shared";
import type { Action, GameState as EngineState } from "@sorcery/shared";
import { tokenForEngineId } from "./actionPaths";
import { cardRefFor } from "./cardIndex";
import { engineTileNumber } from "./coords";

/**
 * Turns one of the computer's engine actions into something a human can follow without
 * reading the log: a sentence, the board pieces it concerns, and — when a card was
 * played — a reveal for the same CpuPlayReveal panel our CPU matches use.
 */
export interface Narration {
  /** One plain sentence, in tile numbers, e.g. "Summons Ogre Goons at tile 12." */
  text: string;
  /** Board pick-tokens to light up while this reads (units, tiles). */
  highlight: string[];
  /** A card to show large, when the computer played one. */
  reveal: Omit<CpuReveal, "seat"> | null;
  /** True for actions whose result deserves an extra beat (a spell, a fight). */
  weighty: boolean;
}

const tileOfUnit = (game: EngineState, id: string): number | null => {
  const unit = game.units[id];
  return unit ? engineTileNumber(unit.x, unit.y) : null;
};

const nameOf = (game: EngineState, id: string): string =>
  game.units[id]?.name ?? game.sites[id]?.name ?? game.artifacts[id]?.name ?? game.auras[id]?.name ?? "something";

const REGION_WORD: Record<string, string> = {
  underground: " (burrowed)",
  underwater: " (submerged)",
  void: " (in the void)",
  surface: "",
};

function abilityLabel(game: EngineState, sourceId: string, key: string): string {
  const name = nameOf(game, sourceId);
  const own = getScript(name)?.abilities?.find((a) => a.key === key);
  if (own) return own.label;
  const unit = game.units[sourceId];
  const granted = unit ? grantedAbilities(game, unit).find((a) => a.key === key) : undefined;
  return granted?.label ?? (key === "ranged" ? "a ranged shot" : key);
}

/**
 * `before` is the state as it was when the computer chose the action (ids still resolvable),
 * so names and squares describe what the player actually saw happen.
 */
export function narrate(before: EngineState, action: Action, stamp: number | string = ""): Narration | null {
  switch (action.t) {
    case "avatarSite": {
      if (action.mode === "draw") {
        return { text: "Draws a site from its atlas.", highlight: [], reveal: null, weighty: false };
      }
      const name = before.cards[action.cardId]?.name ?? "a site";
      const tile = engineTileNumber(action.x, action.y);
      return {
        text: `Plays ${name} at tile ${tile}.`,
        highlight: [`${tileKey(action.x, action.y)}`],
        reveal: { id: `play:${action.cardId}:${stamp}`, card: cardRefFor(name), kind: "site", action: `plays at tile ${tile}` },
        weighty: false,
      };
    }
    case "castSpell": {
      const name = before.cards[action.cardId]?.name ?? "a card";
      const def = getCard(name);
      const caster = nameOf(before, action.casterId);
      const highlight = [tokenForEngineId(before, action.casterId)];
      for (const target of action.targets ?? []) highlight.push(tokenForEngineId(before, target));
      let text: string;
      let label: string;
      if (action.at) {
        const tile = engineTileNumber(action.at.x, action.at.y);
        const region = REGION_WORD[action.at.region ?? "surface"] ?? "";
        highlight.push(tileKey(action.at.x, action.at.y));
        text = `Summons ${name} at tile ${tile}${region}.`;
        label = `summons at tile ${tile}`;
      } else {
        const targets = (action.targets ?? []).map((t) => targetWord(before, t)).filter(Boolean);
        text = targets.length ? `Casts ${name} on ${targets.join(" and ")}.` : `Casts ${name}.`;
        label = `casts with ${caster}`;
      }
      const kind: CpuRevealKind = def.type === "Magic" ? "spell" : "permanent";
      return {
        text,
        highlight,
        reveal: { id: `cast:${action.cardId}:${stamp}`, card: cardRefFor(name), kind, action: label },
        weighty: def.type === "Magic",
      };
    }
    case "moveAttack": {
      const unit = before.units[action.unitId];
      if (!unit) return null;
      const from = tileOfUnit(before, action.unitId);
      const last = action.path[action.path.length - 1];
      const to = last ? engineTileNumber(last.x, last.y) : from;
      const highlight = [tokenForEngineId(before, action.unitId)];
      if (last) highlight.push(tileKey(last.x, last.y));
      const moved = action.path.length > 0 && to !== from;
      if (action.attack && "unit" in action.attack) {
        const victim = nameOf(before, action.attack.unit);
        highlight.push(tokenForEngineId(before, action.attack.unit));
        return {
          text: moved ? `${unit.name} moves to tile ${to} and attacks ${victim}.` : `${unit.name} attacks ${victim}.`,
          highlight,
          reveal: null,
          weighty: true,
        };
      }
      if (action.attack && "site" in action.attack) {
        const site = nameOf(before, action.attack.site);
        return {
          text: moved ? `${unit.name} moves to tile ${to} and attacks ${site}.` : `${unit.name} attacks ${site}.`,
          highlight,
          reveal: null,
          weighty: true,
        };
      }
      return { text: `${unit.name} moves from tile ${from} to tile ${to}.`, highlight, reveal: null, weighty: false };
    }
    case "activate": {
      const source = nameOf(before, action.sourceId);
      const label = abilityLabel(before, action.sourceId, action.ability);
      const highlight = [tokenForEngineId(before, action.sourceId)];
      for (const target of action.targets ?? []) highlight.push(tokenForEngineId(before, target));
      const card = cardRefFor(source);
      return {
        text: `${source} uses ${label}.`,
        highlight,
        reveal: { id: `act:${action.sourceId}:${action.ability}:${stamp}`, card, kind: "ability", action: `activates ${label}` },
        weighty: true,
      };
    }
    case "pickUp": {
      const carrier = nameOf(before, action.unitId);
      const what = [...action.artifactIds, ...(action.unitIds ?? [])].map((id) => nameOf(before, id)).join(", ");
      return { text: `${carrier} picks up ${what}.`, highlight: [tokenForEngineId(before, action.unitId)], reveal: null, weighty: false };
    }
    case "drop": {
      const carrier = nameOf(before, action.unitId);
      const what = [...action.artifactIds, ...(action.unitIds ?? [])].map((id) => nameOf(before, id)).join(", ");
      return { text: `${carrier} sets down ${what}.`, highlight: [tokenForEngineId(before, action.unitId)], reveal: null, weighty: false };
    }
    case "endTurn":
      return { text: "Ends its turn.", highlight: [], reveal: null, weighty: false };
    case "concede":
      return { text: "Concedes.", highlight: [], reveal: null, weighty: false };
    case "mulligan":
      return { text: `Mulligans ${action.back.length} card(s).`, highlight: [], reveal: null, weighty: false };
    case "keepHand":
      return { text: "Keeps its opening hand.", highlight: [], reveal: null, weighty: false };
    case "prompt":
      // prompt answers are narrated by their effect, not the choice itself
      return null;
    default:
      return null;
  }
}

/** A board cell token for an engine square. */
function tileKey(x: number, y: number): string {
  const tile = engineTileNumber(x, y);
  const bx = (tile - 1) % 5;
  const by = Math.floor((tile - 1) / 5);
  return `${bx},${by}`;
}

/** How a target reads in a sentence: a named card, or a tile. */
function targetWord(game: EngineState, target: string): string {
  if (target.startsWith("sq:")) {
    const [x, y] = target.slice(3).split(",").map(Number);
    return `tile ${engineTileNumber(x, y)}`;
  }
  return nameOf(game, target);
}
