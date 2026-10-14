import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESENCE_POLL_MS,
  useEngineGamePresence,
  useEngineGamesCount,
} from "@/lib/engine-mode/presence";
import {
  PRESENCE_API_PATH,
  PRESENCE_HEARTBEAT_MS,
  isPresenceId,
} from "@/lib/engine-mode/presenceStore";

interface Call {
  method: string;
  id: string | null;
  body: string | null;
}

let fetchMock: ReturnType<typeof vi.fn>;
let countResponse = 0;

function calls(): Call[] {
  return fetchMock.mock.calls.map((args) => {
    const [, init] = args as [string, RequestInit | undefined];
    const body = typeof init?.body === "string" ? init.body : null;
    const parsed: unknown = body ? JSON.parse(body) : null;
    const id =
      parsed && typeof parsed === "object" && "id" in parsed
        ? String((parsed as { id: unknown }).id)
        : null;
    return { method: init?.method ?? "GET", id, body };
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  countResponse = 0;
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ count: countResponse }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useEngineGamePresence", () => {
  it("announces nothing while no game is in progress", () => {
    renderHook(() => useEngineGamePresence(false, true));
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("announces nothing when engine mode is off", () => {
    renderHook(() => useEngineGamePresence(true, false));
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("heartbeats one random id, and withdraws it when the game ends", () => {
    const { rerender } = renderHook(
      ({ active }) => useEngineGamePresence(active, true),
      { initialProps: { active: true } },
    );
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 2);
    let seen = calls();
    expect(seen.map((c) => c.method)).toEqual(["POST", "POST", "POST"]);
    const id = seen[0].id;
    expect(isPresenceId(id)).toBe(true);
    expect(seen.every((c) => c.id === id)).toBe(true);
    // only the id travels: no deck, no user
    expect(seen.every((c) => c.body === JSON.stringify({ id }))).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(PRESENCE_API_PATH);

    rerender({ active: false }); // game over
    seen = calls();
    expect(seen.at(-1)).toMatchObject({ method: "DELETE", id });
    const n = fetchMock.mock.calls.length;
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(n);
  });

  it("uses a fresh id for the next game and withdraws on unmount and pagehide", () => {
    const { rerender, unmount } = renderHook(
      ({ active }) => useEngineGamePresence(active, true),
      { initialProps: { active: true } },
    );
    const first = calls()[0].id;
    rerender({ active: false });
    rerender({ active: true });
    const second = calls().at(-1)?.id;
    expect(second).not.toBe(first);

    window.dispatchEvent(new Event("pagehide"));
    expect(calls().at(-1)).toMatchObject({ method: "DELETE", id: second });
    unmount();
    expect(calls().at(-1)).toMatchObject({ method: "DELETE", id: second });
  });
});

describe("useEngineGamesCount", () => {
  it("reads the count and re-polls", async () => {
    countResponse = 3;
    const { result } = renderHook(() => useEngineGamesCount(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(3);
    countResponse = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_POLL_MS);
    });
    expect(result.current).toBe(0);
    expect(calls().every((c) => c.method === "GET")).toBe(true);
  });

  it("is 0 and never fetches when engine mode is off", async () => {
    countResponse = 5;
    const { result } = renderHook(() => useEngineGamesCount(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_POLL_MS * 2);
    });
    expect(result.current).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the last count when a poll fails", async () => {
    countResponse = 2;
    const { result } = renderHook(() => useEngineGamesCount(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_POLL_MS);
    });
    expect(result.current).toBe(2);
  });
});
