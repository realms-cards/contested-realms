import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSocketTokenCache,
  fetchSocketToken,
  getCachedTokenSync,
  setExpectedPrincipalId,
} from "@/lib/net/socketTokenCache";

const STORAGE_KEY = "sorcery:socketToken";

/** Minimal unsigned JWT - the cache only ever reads the payload claims. */
function makeToken(userId: string, guest = false): string {
  const b64 = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  // A non-ASCII name guards the UTF-8 path of the payload decoder
  return `${b64({ alg: "HS256" })}.${b64({ userId, name: "Björn", guest })}.sig`;
}

function installLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

function storeToken(token: string): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      fetchedAt: Date.now(),
    }),
  );
}

describe("socket token cache identity binding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installLocalStorage();
    setExpectedPrincipalId(null);
    clearSocketTokenCache();
  });

  it("reuses a cached token that belongs to the current identity", () => {
    storeToken(makeToken("user_real"));
    setExpectedPrincipalId("user_real");
    expect(getCachedTokenSync()).not.toBeNull();
  });

  it("drops a cached guest token once signed in", async () => {
    // A guest played earlier in this browser; their token is valid for a day
    storeToken(makeToken("guest_abc123", true));

    // Signing in binds the cache to the account
    setExpectedPrincipalId("user_real");

    expect(getCachedTokenSync()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // ...and the next fetch really asks the server rather than being
    // rate-limited into handing back nothing
    const fresh = makeToken("user_real");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ token: fresh }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSocketToken()).resolves.toBe(fresh);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/socket-token",
      expect.anything(),
    );
  });

  it("drops a cached account token after signing out into a guest", () => {
    storeToken(makeToken("user_real"));
    setExpectedPrincipalId("guest_abc123");
    expect(getCachedTokenSync()).toBeNull();
  });

  it("keeps the cached token while the identity is still unknown", () => {
    storeToken(makeToken("user_real"));
    // no setExpectedPrincipalId call - nothing to compare against yet
    expect(getCachedTokenSync()).not.toBeNull();
  });
});
