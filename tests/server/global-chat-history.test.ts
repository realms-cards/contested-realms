import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { describe, expect, it } from "vitest";
import { getGlobalChatHistory, registerChatHandlers } from "../../server/socket/chat-handlers";

/**
 * Lobby chat history lives in a Redis list (newest 500) backed by Postgres. The list used to
 * expire after 7 idle days, which emptied the lobby chat on production with no way back. Now
 * nothing expires it, and when it is gone anyway (eviction, flush) it is refilled from the DB.
 */

interface Row {
  id: string;
  senderId: string | null;
  senderName: string | null;
  content: string;
  createdAt: Date;
}

function fakeRedis() {
  const lists = new Map<string, string[]>();
  const ttls = new Map<string, number>();
  const list = (k: string) => lists.get(k) ?? [];
  const idx = (len: number, i: number) => (i < 0 ? len + i : i);
  const api = {
    lists,
    ttls,
    async llen(k: string) {
      return list(k).length;
    },
    async rpush(k: string, ...v: string[]) {
      lists.set(k, [...list(k), ...v]);
      return list(k).length;
    },
    async ltrim(k: string, a: number, b: number) {
      const l = list(k);
      lists.set(k, l.slice(Math.max(0, idx(l.length, a)), idx(l.length, b) + 1));
      return "OK";
    },
    async lrange(k: string, a: number, b: number) {
      const l = list(k);
      return l.slice(Math.max(0, idx(l.length, a)), idx(l.length, b) + 1);
    },
    async persist(k: string) {
      return ttls.delete(k) ? 1 : 0;
    },
    async expire(k: string, s: number) {
      ttls.set(k, s);
      return 1;
    },
    /** Only the refill-if-empty script is ever evaluated. */
    async eval(_script: string, _n: number, k: string, ...v: string[]) {
      if (list(k).length > 0) return 0;
      return api.rpush(k, ...v);
    },
  };
  return api;
}

function fakePrisma() {
  const rows: Row[] = [];
  let n = 0;
  const api = {
    rows,
    globalChatMessage: {
      async create({ data }: { data: Omit<Row, "id"> }) {
        const row = { id: `m${n++}`, ...data };
        rows.push(row);
        return row;
      },
      async findMany({ take }: { orderBy: unknown; take: number }) {
        return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
      },
    },
  };
  return api;
}

type Handler = (payload?: Record<string, unknown>) => unknown;

function connect(redis: ReturnType<typeof fakeRedis>, prisma: ReturnType<typeof fakePrisma>) {
  const handlers = new Map<string, Handler>();
  const socket = {
    id: "s1",
    on: (event: string, fn: Handler) => handlers.set(event, fn),
    emit: () => true,
  };
  const io = { emit: () => true, to: () => ({ emit: () => true }) };
  registerChatHandlers({
    io: io as unknown as SocketIOServer,
    socket: socket as unknown as Socket,
    storeRedis: redis as unknown as Redis,
    prisma: prisma as unknown as PrismaClient,
    isAuthed: () => true,
    getPlayerBySocket: () => ({ id: "p1" }) as unknown as ReturnType<Parameters<typeof registerChatHandlers>[0]["getPlayerBySocket"]>,
    getPlayerInfo: () => ({ id: "p1", displayName: "Alice" }),
    getRateLimitsForSocket: () => ({ chat: {} }) as unknown as ReturnType<Parameters<typeof registerChatHandlers>[0]["getRateLimitsForSocket"]>,
    tryConsume: () => true,
    incrementMetric: () => {},
    incrementRateLimitHit: () => {},
    debugLog: () => {},
  });
  return {
    async say(content: string) {
      await handlers.get("chat")?.({ content, scope: "global" });
      // persistence is fire-and-forget; let its awaits settle
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

describe("lobby chat history", () => {
  it("stores every message in the DB and never sets an expiry", async () => {
    const redis = fakeRedis();
    const prisma = fakePrisma();
    redis.ttls.set("chat:global", 604800); // a list written before the change
    await redis.rpush("chat:global", JSON.stringify({ from: null, content: "old", scope: "global", ts: 1 }));
    const client = connect(redis, prisma);
    await client.say("hello");
    expect(prisma.rows.map((r) => [r.senderId, r.senderName, r.content])).toEqual([["p1", "Alice", "hello"]]);
    expect(redis.ttls.has("chat:global")).toBe(false);
    const h = await getGlobalChatHistory(redis as unknown as Redis, prisma as unknown as PrismaClient, 100);
    expect(h.messages.map((m) => m.content)).toEqual(["old", "hello"]);
  });

  it("refills a lost Redis list from the DB, oldest first", async () => {
    const redis = fakeRedis();
    const prisma = fakePrisma();
    for (let i = 0; i < 3; i++) {
      await prisma.globalChatMessage.create({
        data: { senderId: "p1", senderName: "Alice", content: `m${i}`, createdAt: new Date(1000 + i) },
      });
    }
    const h = await getGlobalChatHistory(redis as unknown as Redis, prisma as unknown as PrismaClient, 100);
    expect(h.messages.map((m) => m.content)).toEqual(["m0", "m1", "m2"]);
    expect(h.messages[0].from).toEqual({ id: "p1", displayName: "Alice" });
    expect(h.messages[0].ts).toBe(1000);
    expect(redis.lists.get("chat:global")).toHaveLength(3);
  });

  it("a message sent into an empty list lands after the refilled history", async () => {
    const redis = fakeRedis();
    const prisma = fakePrisma();
    await prisma.globalChatMessage.create({
      data: { senderId: "p2", senderName: "Bob", content: "earlier", createdAt: new Date(1000) },
    });
    const client = connect(redis, prisma);
    await client.say("now");
    const h = await getGlobalChatHistory(redis as unknown as Redis, prisma as unknown as PrismaClient, 100);
    expect(h.messages.map((m) => m.content)).toEqual(["earlier", "now"]);
  });

  it("pages from the DB when there is no Redis", async () => {
    const prisma = fakePrisma();
    for (let i = 0; i < 5; i++) {
      await prisma.globalChatMessage.create({
        data: { senderId: null, senderName: null, content: `m${i}`, createdAt: new Date(1000 + i) },
      });
    }
    const p = prisma as unknown as PrismaClient;
    const first = await getGlobalChatHistory(null, p, 2);
    expect(first.messages.map((m) => m.content)).toEqual(["m3", "m4"]);
    expect(first.hasMore).toBe(true);
    const next = await getGlobalChatHistory(null, p, 2, first.oldestIndex);
    expect(next.messages.map((m) => m.content)).toEqual(["m1", "m2"]);
    const last = await getGlobalChatHistory(null, p, 2, next.oldestIndex);
    expect(last.messages.map((m) => m.content)).toEqual(["m0"]);
    expect(last.hasMore).toBe(false);
  });
});
