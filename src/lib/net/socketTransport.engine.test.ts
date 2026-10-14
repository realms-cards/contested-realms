import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";

/** A socket.io client socket stand-in: server events are fired with `serverSends`. */
class FakeSocket extends EventEmitter {
  connected = false;
  io = { reconnection: true, on: () => undefined, off: () => undefined };
  sent: unknown[][] = [];
  connect() {
    return this;
  }
  disconnect() {
    return this;
  }
  override emit(event: string, ...args: unknown[]): boolean {
    this.sent.push([event, ...args]);
    return true;
  }
  serverSends(event: string, payload: unknown) {
    return super.emit(event, payload);
  }
}
const socket = new FakeSocket();

vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("./socketTokenCache", () => ({
  fetchSocketToken: async () => null,
  clearSocketTokenCache: () => undefined,
  getCachedTokenSync: () => null,
  wasLastFetchUnauthorized: () => false,
}));
vi.mock("./socketLeader", () => ({
  getSocketLeader: () => ({ start: () => undefined, onChange: () => () => undefined, isLeader: () => true, stop: () => undefined }),
}));

describe("the socket transport and rules-engine matches", () => {
  it("hands the server's engine board and refusals to the engine screen", async () => {
    const { SocketTransport } = await import("./socketTransport");
    const transport = new SocketTransport();
    void transport.connect({ displayName: "Tester", playerId: "p_test" }).catch(() => undefined);
    await vi.waitFor(() => expect(socket.listenerCount("welcome")).toBeGreaterThan(0));

    // An event the server sends only reaches a listener if the transport subscribes to it.
    // These two were declared in the event map but never subscribed, so an engine match sat
    // on "waiting for your opponent's deck" although the server had dealt the game.
    const views: unknown[] = [];
    const rejects: unknown[] = [];
    transport.on("engine:view", (v) => views.push(v));
    transport.on("engine:reject", (r) => rejects.push(r));

    socket.serverSends("engine:view", {
      matchId: "m1",
      rev: 0,
      seat: 1,
      view: { players: [] },
      power: {},
      disabled: [],
      legal: [],
      build: "abc.r1",
    });
    socket.serverSends("engine:reject", { matchId: "m1", reason: "Not your turn.", rev: 0 });

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ matchId: "m1", seat: 1, build: "abc.r1" });
    expect(rejects).toEqual([{ matchId: "m1", reason: "Not your turn.", rev: 0 }]);
  });
});
