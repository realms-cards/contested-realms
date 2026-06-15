import { describe, expect, it, vi } from "vitest";
import type { CardRef } from "@/lib/game/store/types";
import {
  getAuthoritativeZones,
  hasHiddenPlaceholders,
  isHiddenPlaceholder,
  requestZoneReveal,
  resolveZoneReveal,
} from "@/lib/game/store/utils/revealZones";

const realCard = (id: number, name: string): CardRef => ({
  cardId: id,
  name,
  type: "Magic",
  instanceId: `i${id}`,
});
const placeholder = (i: number): CardRef =>
  ({ cardId: 0, name: "", faceDown: true, instanceId: `hidden-${i}` }) as CardRef;

describe("isHiddenPlaceholder / hasHiddenPlaceholders", () => {
  it("detects placeholder by cardId 0 and faceDown", () => {
    expect(isHiddenPlaceholder(placeholder(0))).toBe(true);
    expect(isHiddenPlaceholder(realCard(5, "Bolt"))).toBe(false);
    expect(hasHiddenPlaceholders([realCard(1, "a"), placeholder(0)])).toBe(true);
    expect(hasHiddenPlaceholders([realCard(1, "a")])).toBe(false);
  });
});

function storeLike(opts: {
  actorKey: "p1" | "p2" | null;
  online: boolean;
  p2Hand: CardRef[];
  onSend?: (msg: { requestId: string }) => void;
}) {
  const transport = opts.online
    ? {
        sendMessage: (msg: unknown) => {
          opts.onSend?.(msg as { requestId: string });
        },
      }
    : null;
  return () => ({
    actorKey: opts.actorKey,
    transport,
    zones: {
      p1: { hand: [], spellbook: [], atlas: [], graveyard: [], battlefield: [], collection: [], banished: [] },
      p2: {
        hand: opts.p2Hand,
        spellbook: [],
        atlas: [],
        graveyard: [],
        battlefield: [],
        collection: [],
        banished: [],
      },
    },
  });
}

describe("getAuthoritativeZones", () => {
  it("returns local data in hotseat (actorKey null)", async () => {
    const get = storeLike({ actorKey: null, online: false, p2Hand: [realCard(1, "x")] });
    const out = await getAuthoritativeZones(get as never, "p2", ["hand"]);
    expect(out.hand?.map((c) => c.name)).toEqual(["x"]);
  });

  it("returns local data online when data is real (projection off)", async () => {
    const send = vi.fn();
    const get = storeLike({ actorKey: "p1", online: true, p2Hand: [realCard(2, "y")], onSend: send });
    const out = await getAuthoritativeZones(get as never, "p2", ["hand"]);
    expect(out.hand?.map((c) => c.name)).toEqual(["y"]);
    expect(send).not.toHaveBeenCalled(); // no reveal needed
  });

  it("requests a server reveal online when local data is placeholders", async () => {
    let captured: { requestId: string } | null = null;
    const get = storeLike({
      actorKey: "p1",
      online: true,
      p2Hand: [placeholder(0), placeholder(1)],
      onSend: (m) => {
        captured = m;
      },
    });
    const promise = getAuthoritativeZones(get as never, "p2", ["hand"]);
    // The request is emitted synchronously; resolve it as the server would.
    expect(captured).not.toBeNull();
    const requestId = (captured as unknown as { requestId: string }).requestId;
    resolveZoneReveal({ requestId, zones: { hand: [realCard(9, "real")] } });
    const out = await promise;
    expect(out.hand?.map((c) => c.name)).toEqual(["real"]);
  });
});

describe("requestZoneReveal", () => {
  it("resolves when a matching result arrives", async () => {
    let requestId = "";
    const transport = {
      sendMessage: (m: unknown) => {
        requestId = (m as { requestId: string }).requestId;
      },
    };
    const p = requestZoneReveal(transport, "p2", ["spellbook"]);
    resolveZoneReveal({ requestId, zones: { spellbook: [realCard(3, "z")] } });
    const out = await p;
    expect(out.spellbook?.map((c) => c.name)).toEqual(["z"]);
  });

  it("ignores results with an unknown requestId", () => {
    expect(resolveZoneReveal({ requestId: "nope", zones: {} })).toBe(false);
  });
});
