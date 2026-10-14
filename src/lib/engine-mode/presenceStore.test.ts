import { describe, expect, it } from "vitest";
import {
  PRESENCE_TTL_MS,
  createMemoryPresenceStore,
  createRedisPresenceStore,
  isPresenceId,
  presenceCountFromBody,
  presenceIdFromBody,
} from "@/lib/engine-mode/presenceStore";
import type { PresenceRedis, PresenceStore } from "@/lib/engine-mode/presenceStore";

const A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const C = "cccccccc-3333-4333-8333-cccccccccccc";

/** In-memory stand-in for the ioredis sorted-set commands the store uses. */
function fakeRedis(): PresenceRedis & { ttl: Map<string, number> } {
  const sets = new Map<string, Map<string, number>>();
  const ttl = new Map<string, number>();
  const set = (key: string) => {
    let s = sets.get(key);
    if (!s) {
      s = new Map();
      sets.set(key, s);
    }
    return s;
  };
  return {
    ttl,
    async zadd(key, score, member) {
      const s = set(key);
      const added = s.has(member) ? 0 : 1;
      s.set(member, score);
      return added;
    },
    async zrem(key, member) {
      return set(key).delete(member) ? 1 : 0;
    },
    async zremrangebyscore(key, min, max) {
      const lo = min === "-inf" ? -Infinity : Number(min);
      let removed = 0;
      for (const [m, score] of set(key)) {
        if (score >= lo && score <= max) {
          set(key).delete(m);
          removed++;
        }
      }
      return removed;
    },
    async zcard(key) {
      return set(key).size;
    },
    async zscore(key, member) {
      const score = set(key).get(member);
      return score === undefined ? null : String(score);
    },
    async pexpire(key, ms) {
      ttl.set(key, ms);
      return 1;
    },
  };
}

const variants: Array<[string, (ttl: number, max: number) => PresenceStore]> = [
  ["memory", (ttl, max) => createMemoryPresenceStore(ttl, max)],
  ["redis", (ttl, max) => createRedisPresenceStore(fakeRedis(), ttl, max)],
];

describe.each(variants)("%s presence store", (_name, make) => {
  it("counts each id once however often it heartbeats", async () => {
    const store = make(PRESENCE_TTL_MS, 100);
    await store.touch(A, 0);
    await store.touch(A, 30_000);
    await store.touch(A, 60_000);
    await store.touch(B, 60_000);
    expect(await store.count(60_000)).toBe(2);
  });

  it("drops an id once its TTL passes without a heartbeat", async () => {
    const store = make(PRESENCE_TTL_MS, 100);
    await store.touch(A, 0);
    await store.touch(B, 50_000);
    expect(await store.count(PRESENCE_TTL_MS)).toBe(2);
    // A last seen at 0: gone one ms past the TTL; B still fresh
    expect(await store.count(PRESENCE_TTL_MS + 1)).toBe(1);
    expect(await store.count(50_000 + PRESENCE_TTL_MS + 1)).toBe(0);
  });

  it("a heartbeat keeps an id alive past the first TTL", async () => {
    const store = make(PRESENCE_TTL_MS, 100);
    await store.touch(A, 0);
    await store.touch(A, 80_000);
    expect(await store.count(150_000)).toBe(1);
  });

  it("removes an id at once", async () => {
    const store = make(PRESENCE_TTL_MS, 100);
    await store.touch(A, 0);
    await store.touch(B, 0);
    await store.remove(A);
    await store.remove(C); // unknown ids are fine
    expect(await store.count(1)).toBe(1);
  });

  it("refuses new ids when full, but keeps refreshing known ones and frees expired slots", async () => {
    const store = make(PRESENCE_TTL_MS, 2);
    expect(await store.touch(A, 0)).toBe(true);
    expect(await store.touch(B, 0)).toBe(true);
    expect(await store.touch(C, 10)).toBe(false);
    expect(await store.touch(A, 20)).toBe(true);
    expect(await store.count(20)).toBe(2);
    // B expires; its slot goes to C
    expect(await store.touch(C, PRESENCE_TTL_MS + 5)).toBe(true);
    expect(await store.count(PRESENCE_TTL_MS + 5)).toBe(2);
  });
});

describe("redis presence store", () => {
  it("lets the whole set lapse when every game goes quiet", async () => {
    const redis = fakeRedis();
    const store = createRedisPresenceStore(redis, 1000, 10, "k");
    await store.touch(A, 0);
    expect(redis.ttl.get("k")).toBe(2000);
  });
});

describe("presence payloads", () => {
  it("accepts only random-looking ids", () => {
    expect(isPresenceId(A)).toBe(true);
    expect(isPresenceId("short")).toBe(false);
    expect(isPresenceId("x".repeat(65))).toBe(false);
    expect(isPresenceId("has spaces in it, sixteen+")).toBe(false);
    expect(isPresenceId(42)).toBe(false);
    expect(presenceIdFromBody({ id: A })).toBe(A);
    expect(presenceIdFromBody({ id: "nope" })).toBeNull();
    expect(presenceIdFromBody(null)).toBeNull();
    expect(presenceIdFromBody("id")).toBeNull();
  });

  it("reads a count", () => {
    expect(presenceCountFromBody({ count: 3 })).toBe(3);
    expect(presenceCountFromBody({ count: -1 })).toBeNull();
    expect(presenceCountFromBody({ count: "3" })).toBeNull();
    expect(presenceCountFromBody({})).toBeNull();
    expect(presenceCountFromBody(undefined)).toBeNull();
  });
});
