import { cleanup, render } from "@testing-library/react";
import type { Action, PlayerId, PlayerView } from "@sorcery/shared";
import { botAction } from "@untested-realm/bot/bot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { stateFromView, useEngineSession } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import { EnginePool } from "../../../server/modules/engine/pool";
import { EngineMatchService, type ViewEnvelope } from "../../../server/modules/engine/service";
import EngineGame2D from "./2d/EngineGame2D";
import EngineActionRail from "./EngineActionRail";
import EngineContextMenu from "./EngineContextMenu";
import EngineHud from "./EngineHud";
import { EngineLifeCounters } from "./EngineMatch";
import EnginePromptPanel from "./EnginePromptPanel";
import EngineResourcePanels from "./EngineResourcePanels";
import { useEngineInteraction } from "./useEngineInteraction";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));
vi.mock("@/components/game/MusicGameSync", () => ({ default: () => null }));
vi.mock("@/lib/audio/gameSfx", () => ({ GameSoundEffects: () => null, withSfxSource: (_s: unknown, fn: () => void) => fn() }));

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

/** The DOM half of the 3D screen — everything except the canvas, which jsdom cannot draw. */
function Screen3DChrome() {
  const interaction = useEngineInteraction();
  return (
    <>
      <EngineHud interaction={interaction} onExit={() => undefined} />
      <EngineResourcePanels />
      <EnginePromptPanel />
      <EngineContextMenu />
      <EngineActionRail interaction={interaction} onExit={() => undefined} />
      <EngineLifeCounters />
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(763);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useEngineSession.getState().stop();
  useEngineSession.setState({ mode: "local", seat: 0 as PlayerId, game: null, legal: null });
  useGameStore.setState({ events: [], previewCard: null });
});

/** Paint one server envelope as that seat's client would, on both kinds of board. */
function paintAs(envelope: ViewEnvelope) {
  const seat = envelope.seat as PlayerId;
  useEngineSession.getState().joinRemote("m", seat, () => undefined);
  useEngineSession.getState().applyRemoteView({
    ...envelope,
    seat,
    view: envelope.view as PlayerView,
    legal: envelope.legal as Action[],
  });
  expect(useEngineSession.getState().game, "the view was accepted").not.toBeNull();
  for (const ui of [<EngineGame2D key="2d" onExit={() => undefined} onRestart={() => undefined} />, <Screen3DChrome key="3d" />]) {
    const { container, queryAllByRole } = render(<ColorBlindProvider>{ui}</ColorBlindProvider>);
    if (ui.key === "3d") {
      // The rail's End turn follows the server: shown exactly when this seat may end the turn
      // (seat 1 used to be judged as seat 0 — no button on its turn, a refused one on the other).
      const canEnd = (envelope.legal as Action[]).some((a) => a.t === "endTurn");
      const buttons = (label: string) => queryAllByRole("button", { name: label });
      expect(buttons("End turn"), `seat ${seat} End turn`).toHaveLength(canEnd ? 1 : 0);
      expect(buttons("Undo"), `seat ${seat} Undo is always on the rail`).toHaveLength(1);
      // The board draws the viewer as p1 whichever seat they hold; the life chips must still
      // name the seat actually held (the second seat used to read "P1 (You)").
      const chip = container.querySelector('[title="You"]');
      expect(chip?.textContent?.startsWith(seat === 1 ? "P2" : "P1"), `seat ${seat} life chip: ${chip?.textContent}`).toBe(true);
    }
    cleanup();
  }
}

/**
 * Play a game through the server's own engine service and paint every view it sends, as both
 * seats' clients would. Returns how many actions were played.
 */
async function playThrough(deckA: number, deckB: number, gameSeed: number, maxSteps: number): Promise<number> {
  const service = new EngineMatchService(new EnginePool(0));
  const deck = (i: number) => toEngineDeck(enginePrecons[i % enginePrecons.length]);
  expect((await service.start("m", [deck(deckA), deck(deckB)], ["Alice", "Bob"], gameSeed, 0)).ok).toBe(true);
  let seed = gameSeed;
  let played = 0;
  const pick = <T,>(list: readonly T[]) => list[(seed = (seed * 1103515245 + 12345) & 0x7fffffff) % list.length];
  try {
    for (let step = 0; step < maxSteps; step++) {
      const views = [await service.viewFor("m", 0), await service.viewFor("m", 1)];
      for (const v of views) if (v) paintAs(v);
      if (views.some((v) => v?.over)) break;
      const acting = views.find((v) => v && v.legal.length > 0);
      if (!acting) {
        // A prompt is answered directly, not from `legal`. Answer it the way the prompt panel's
        // Auto button does online: the bot, run on the CLIENT's view (all a client ever has).
        const prompted = views.find((v) => v && (v.view as { prompts: { player: number }[] }).prompts.some((p) => p.player === v.seat));
        expect(prompted, `step ${step}: someone must be able to act`).toBeTruthy();
        const seat = prompted!.seat as PlayerId;
        const answer = botAction(stateFromView(prompted!.view as PlayerView), seat);
        const result = await service.act("m", seat, answer);
        expect(result.ok, `step ${step}: Auto on a view answered ${JSON.stringify(answer).slice(0, 80)}`).toBe(true);
        played++;
        continue;
      }
      // prefer moves that change the board over ending the turn, so the views get varied
      const legal = acting.legal as { t: string }[];
      const moves = legal.filter((a) => a.t !== "endTurn" && a.t !== "concede");
      const action = moves.length && step % 5 !== 4 ? pick(moves) : (legal.find((a) => a.t === "endTurn") ?? legal[0]);
      expect((await service.act("m", acting.seat, action)).ok, `step ${step}: ${action.t}`).toBe(true);
      played++;
    }
  } finally {
    service.shutdown();
  }
  return played;
}

describe("the engine screens in a player-vs-player match", () => {
  // The client never holds the GameState online: it holds a VIEW, whose players carry pile
  // counts instead of piles. Anything that reads the state directly (player.spellbook.length
  // took the screen down on the first board) is caught here, through real server views.
  it.each([
    [0, 1, 11],
    [2, 3, 4],
    [4, 5, 9],
  ])("draws every view the server sends, from either seat (decks %i v %i, seed %i)", async (a, b, gameSeed) => {
    expect(await playThrough(a, b, gameSeed, 40), "the game actually moved on").toBeGreaterThan(20);
  }, 120_000);
});
