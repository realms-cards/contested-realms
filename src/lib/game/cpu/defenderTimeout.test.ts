import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CPU_DEFENDER_TIMEOUT_MS } from "@/lib/game/cpu/controller";
import { createGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";
import type { CustomMessage } from "@/lib/net/transport";

type Combat = NonNullable<GameState["pendingCombat"]>;
const attack = (id: string, overrides: Partial<Combat> = {}): Combat => ({id,tile:{x:2,y:1},attacker:{at:"2,1",index:0,owner:1,instanceId:"pegasus"},
  target:{kind:"permanent",at:"2,1",index:1},defenderSeat:"p2",defenders:[],status:"declared",createdAt:0,...overrides});

/** The human client (p1) of a CPU match, during its own Main phase. */
function setup() {
  // LocalTransport has no custom-message channel: give it a recording one.
  const sent = vi.fn<(message: CustomMessage) => void>();
  const store = createGameStore(), transport = Object.assign(new LocalTransport(),{sendMessage:sent});
  store.setState({opponentPlayerId:"cpu_bot",actorKey:"p1",matchId:"defender-timeout",transport,phase:"Main",currentPlayer:1,turn:3} as Partial<GameState>);
  return {store,sent};
}
const combatCommits = (sent: ReturnType<typeof setup>["sent"]) => sent.mock.calls.filter(([message]) => (message as unknown as {type?: string}).type === "combatCommit");

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("CPU defender backup timeout", () => {
  it("lets an attack go ahead unblocked when the CPU never declares defenders", () => {
    const {store,sent} = setup();
    store.setState({pendingCombat:attack("cmb_silent")});
    vi.advanceTimersByTime(CPU_DEFENDER_TIMEOUT_MS-1);
    expect(store.getState().pendingCombat?.status).toBe("declared");
    vi.advanceTimersByTime(1);
    expect(store.getState().pendingCombat).toMatchObject({id:"cmb_silent",status:"committed",defenders:[]});
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({type:"combatCommit",id:"cmb_silent",defenders:[],playerKey:"p2"}));
    expect(store.getState().events.at(-1)?.text).toMatch(/did not answer in time/);
  });

  it("stops waiting once the CPU answers, and never commits for the human's own defence", () => {
    const {store,sent} = setup();
    store.setState({pendingCombat:attack("cmb_answered")});
    store.getState().receiveCustomMessage({type:"combatCommit",id:"cmb_answered",defenders:[],target:{kind:"permanent",at:"2,1",index:1},
      tile:{x:2,y:1},playerKey:"p2"} as unknown as CustomMessage);
    expect(store.getState().pendingCombat?.status).toBe("committed");
    vi.advanceTimersByTime(CPU_DEFENDER_TIMEOUT_MS*2);
    expect(combatCommits(sent)).toEqual([]);
    // The CPU attacks and the human defends: that wait is the human's, not the CPU's.
    store.setState({pendingCombat:attack("cmb_human_defends",{attacker:{at:"2,1",index:0,owner:2},defenderSeat:"p1"})});
    vi.advanceTimersByTime(CPU_DEFENDER_TIMEOUT_MS*2);
    expect(store.getState().pendingCombat?.status).toBe("declared");
    expect(combatCommits(sent)).toEqual([]);
  });
});
