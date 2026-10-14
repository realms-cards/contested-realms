import { NextResponse } from "next/server";
import { FEATURE_ENGINE_MODE } from "@/lib/config/features";
import {
  createMemoryPresenceStore,
  createRedisPresenceStore,
  presenceIdFromBody,
} from "@/lib/engine-mode/presenceStore";
import type { PresenceStore } from "@/lib/engine-mode/presenceStore";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Rules-engine game presence: POST `{ id }` while a game is in progress (a
 * heartbeat), DELETE `{ id }` when it ends, GET for the live count the lobby
 * shows. Only an anonymous random id is ever received.
 */

const REDIS_TIMEOUT_MS = 500;

const redisStore = createRedisPresenceStore(getRedis());
// Used only while Redis is unreachable (e.g. a dev box without it); per process.
const memoryStore = createMemoryPresenceStore();

async function withStore<T>(op: (store: PresenceStore) => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op(redisStore),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("redis timeout")), REDIS_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return op(memoryStore);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function json(body: { count: number } | { error: string }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readId(req: Request): Promise<string | null> {
  try {
    return presenceIdFromBody(await req.json());
  } catch {
    return null;
  }
}

export async function GET() {
  if (!FEATURE_ENGINE_MODE) return json({ count: 0 });
  const count = await withStore((s) => s.count(Date.now()));
  return json({ count });
}

export async function POST(req: Request) {
  if (!FEATURE_ENGINE_MODE) return json({ error: "disabled" }, 404);
  const id = await readId(req);
  if (!id) return json({ error: "bad id" }, 400);
  const now = Date.now();
  const accepted = await withStore((s) => s.touch(id, now));
  if (!accepted) return json({ error: "full" }, 429);
  return json({ count: await withStore((s) => s.count(now)) });
}

export async function DELETE(req: Request) {
  if (!FEATURE_ENGINE_MODE) return json({ error: "disabled" }, 404);
  const id = await readId(req);
  if (!id) return json({ error: "bad id" }, 400);
  await withStore((s) => s.remove(id));
  return json({ count: await withStore((s) => s.count(Date.now())) });
}
