import type { CpuReveal, CpuRevealKind } from "@/lib/game/cpu/revealQueue";
import type { CellKey } from "@/lib/game/store/types";
import { getCard, getScript, grantedAbilities } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { tokenForEngineId } from "./actionPaths";
import { cardRefFor } from "./cardIndex";
import { footprintAfter } from "./casterActions";
import { engineTileNumber } from "./coords";
import { footprintCell } from "./projection";

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
  /**
   * Whose card the reveal shows — its OWNER, not whoever played it. Under Courtesan Thaïs the
   * computer plays the human's cards, which must still read as the human's (blue) card.
   * Absent means the computer's.
   */
  revealSeat?: "p1" | "p2";
}

export interface NarrateOptions {
  /**
   * The computer is playing the HUMAN's turn (Courtesan Thaïs, `flow.thaisActive === 0`): the
   * pieces it moves are the reader's own, so the sentences say so — "Computer moves your
   * Flamecaller from tile 18 to tile 13", "Computer ends your turn".
   */
  pilotingHuman?: boolean;
}

const seatKey = (seat: PlayerId | null | undefined): "p1" | "p2" => (seat === 0 ? "p1" : "p2");

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
export function narrate(
  before: EngineState,
  action: Action,
  stamp: number | string = "",
  options: NarrateOptions = {},
): Narration | null {
  const story = narrateAction(before, action, stamp);
  if (!story || !options.pilotingHuman) return story;
  const text = secondPerson(before, action);
  return text ? { ...story, text } : story;
}

function narrateAction(before: EngineState, action: Action, stamp: number | string): Narration | null {
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
        revealSeat: seatKey(before.cards[action.cardId]?.owner),
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
        revealSeat: seatKey(before.cards[action.cardId]?.owner),
      };
    }
    case "moveAttack": {
      const unit = before.units[action.unitId];
      if (!unit) return null;
      const from = tileOfUnit(before, action.unitId);
      const last = action.path[action.path.length - 1];
      const to = last ? engineTileNumber(last.x, last.y) : from;
      const highlight = [tokenForEngineId(before, action.unitId)];
      if (last) {
        // a multi-square mover lands where its card will be drawn: its new footprint's cell
        // (the same cell actionPaths keys the move on and unitCell draws it at)
        const feet = unit.isAvatar ? [] : footprintAfter(unit, action.path);
        highlight.push((feet.length > 1 ? footprintCell(feet) : null) ?? tileKey(last.x, last.y));
      }
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
        revealSeat: seatKey(controllerOf(before, action.sourceId)),
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

/** Who controls a board piece now (a unit, site, artifact's bearer, aura), or null. */
function controllerOf(game: EngineState, id: string): PlayerId | null {
  const unit = game.units[id];
  if (unit) return unit.controller;
  const site = game.sites[id];
  if (site) return site.controller;
  const artifact = game.artifacts[id];
  if (artifact) {
    const bearer = artifact.carriedBy ? game.units[artifact.carriedBy] : undefined;
    return bearer?.controller ?? game.cards[artifact.cardId]?.owner ?? null;
  }
  const aura = game.auras[id];
  return aura ? (game.cards[aura.cardId]?.owner ?? null) : null;
}

/** A piece named for the human reader: "your Flamecaller" when it is theirs. */
function yours(game: EngineState, id: string): string {
  const name = targetWord(game, id);
  return !id.startsWith("sq:") && controllerOf(game, id) === 0 ? `your ${name}` : name;
}

/**
 * The same action, told to the human whose turn the computer is playing (Courtesan Thaïs).
 * Null keeps the plain sentence (a mulligan, a concession — nothing of theirs to point at).
 */
function secondPerson(before: EngineState, action: Action): string | null {
  switch (action.t) {
    case "avatarSite": {
      if (action.mode === "draw") return "Computer draws a site for you.";
      const name = before.cards[action.cardId]?.name ?? "a site";
      return `Computer plays your ${name} at tile ${engineTileNumber(action.x, action.y)}.`;
    }
    case "castSpell": {
      const name = before.cards[action.cardId]?.name ?? "a card";
      if (action.at) {
        const region = REGION_WORD[action.at.region ?? "surface"] ?? "";
        return `Computer summons your ${name} at tile ${engineTileNumber(action.at.x, action.at.y)}${region}.`;
      }
      const targets = (action.targets ?? []).map((t) => yours(before, t)).filter(Boolean);
      return targets.length ? `Computer casts your ${name} on ${targets.join(" and ")}.` : `Computer casts your ${name}.`;
    }
    case "moveAttack": {
      const unit = before.units[action.unitId];
      if (!unit) return null;
      const mover = yours(before, action.unitId);
      const from = tileOfUnit(before, action.unitId);
      const last = action.path[action.path.length - 1];
      const to = last ? engineTileNumber(last.x, last.y) : from;
      const moved = action.path.length > 0 && to !== from;
      const victim = action.attack
        ? "unit" in action.attack
          ? yours(before, action.attack.unit)
          : "site" in action.attack
            ? nameOf(before, action.attack.site)
            : null
        : null;
      // "attacks" stays in the sentence: the 2D board reads attacks off the narration's words
      if (victim) return moved ? `Computer moves ${mover} to tile ${to} and attacks ${victim}.` : `Computer attacks ${victim} with ${mover}.`;
      return `Computer moves ${mover} from tile ${from} to tile ${to}.`;
    }
    case "activate":
      return `Computer uses ${abilityLabel(before, action.sourceId, action.ability)} with ${yours(before, action.sourceId)}.`;
    case "pickUp": {
      const what = [...action.artifactIds, ...(action.unitIds ?? [])].map((id) => nameOf(before, id)).join(", ");
      return `Computer has ${yours(before, action.unitId)} pick up ${what}.`;
    }
    case "drop": {
      const what = [...action.artifactIds, ...(action.unitIds ?? [])].map((id) => nameOf(before, id)).join(", ");
      return `Computer has ${yours(before, action.unitId)} set down ${what}.`;
    }
    case "endTurn":
      return "Computer ends your turn.";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Prompt answers that cost a card (Troll Bridge's toll and its kind)

/**
 * A trigger prompt as it stood before the computer answered it — captured BEFORE the answer is
 * applied, because the engine shifts the prompt off `game.prompts` and the hands change.
 */
export interface PromptAnswerSnapshot {
  promptId: string;
  title: string;
  /** the card whose ability asked (a site, a unit…), when the prompt names one */
  sourceId: string;
  sourceName: string | null;
  /** the board cell the asking card stands on (our cell keys), when it is on the board */
  sourceCell: CellKey | null;
  /** both seats' hands as they were */
  hands: [string[], string[]];
}

export function snapshotPromptAnswer(game: EngineState, action: Action): PromptAnswerSnapshot | null {
  if (action.t !== "prompt") return null;
  const prompt = game.prompts.find((p) => p.id === action.promptId);
  if (!prompt) return null;
  const ctx: unknown = prompt.ctx;
  const sourceId =
    ctx && typeof ctx === "object" && "sourceId" in ctx && typeof ctx.sourceId === "string" ? ctx.sourceId : "";
  const site = sourceId ? game.sites[sourceId] : undefined;
  const unit = sourceId ? game.units[sourceId] : undefined;
  const at = site ?? unit;
  const sourceName = sourceId ? (site?.name ?? unit?.name ?? game.artifacts[sourceId]?.name ?? game.auras[sourceId]?.name ?? null) : null;
  return {
    promptId: prompt.id,
    title: prompt.title,
    sourceId,
    sourceName,
    sourceCell: at ? (tileKey(at.x, at.y) as CellKey) : null,
    hands: [[...game.players[0].hand], [...game.players[1].hand]],
  };
}

export interface PromptAnswerNarration extends Narration {
  /** the cards that left a hand for a cemetery when the answer resolved */
  discarded: { cardId: string; name: string; seat: PlayerId }[];
  /** the asking card's cell, for the feed entry */
  cells: CellKey[];
}

/**
 * The computer's answer to a prompt, told when it cost a card: "Computer pays the Troll Bridge
 * toll: discards Fireball." General on purpose — any answer that moves cards from a hand to a
 * cemetery reads this way; a toll (by the prompt's own title) gets the toll wording, and a
 * refused toll is said too, since the strike that follows otherwise comes out of nowhere.
 * Null when the answer cost nothing worth saying.
 */
export function narratePromptAnswer(
  snap: PromptAnswerSnapshot,
  after: EngineState,
  stamp: number | string = "",
): PromptAnswerNarration | null {
  const discarded: PromptAnswerNarration["discarded"] = [];
  for (const seat of [0, 1] as const) {
    const now = new Set(after.players[seat].hand);
    for (const cardId of snap.hands[seat]) {
      if (now.has(cardId)) continue;
      const card = after.cards[cardId];
      const owner = card?.owner ?? seat;
      if (!card || !after.players[owner]?.cemetery.includes(cardId)) continue;
      discarded.push({ cardId, name: card.name, seat });
    }
  }
  const toll = /\btoll\b/i.test(snap.title);
  const source = snap.sourceName;
  const highlight = snap.sourceCell ? [snap.sourceCell] : [];
  const cells = snap.sourceCell ? [snap.sourceCell] : [];
  if (!discarded.length) {
    if (!toll || !source) return null;
    return { text: `Computer refuses the ${source} toll.`, highlight, reveal: null, weighty: true, discarded, cells };
  }
  const names = discarded.map((d) => (d.seat === 0 ? `your ${d.name}` : d.name)).join(" and ");
  const text = toll && source
    ? `Computer pays the ${source} toll: discards ${names}.`
    : source
      ? `${source}: Computer discards ${names}.`
      : `Computer discards ${names}.`;
  const first = discarded[0];
  return {
    text,
    highlight,
    reveal: {
      id: `discard:${first.cardId}:${stamp}`,
      card: cardRefFor(first.name),
      kind: "trigger",
      action: toll && source ? `discarded to pay the ${source} toll` : "discarded",
    },
    weighty: true,
    revealSeat: seatKey(after.cards[first.cardId]?.owner ?? first.seat),
    discarded,
    cells,
  };
}

/**
 * A first-class line for the 2D action feed that the engine's own log cannot give: the log says
 * "Wild Boars pays the troll's toll." without naming the card that went, so the session records
 * what it saw and the feed shows this entry (with the card's thumbnail) in its place.
 */
export interface EngineFeedNote {
  /** log indices the answer wrote; they fold under this entry instead of standing alone */
  lines: number[];
  /** the last log index before the answer, so an answer that logged nothing still has a place */
  after: number;
  seat: "p1" | "p2";
  kind: "discard";
  text: string;
  /** the card shown as the entry's thumbnail */
  card: string | null;
  cells: CellKey[];
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
