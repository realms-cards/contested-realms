import { afterEach, describe, expect, it } from "vitest";

import {
  getClientIp,
  hashIp,
  isPrivateOrLoopback,
  resolveClientIpHash,
  resolveSameNetworkGuard,
} from "../../../server/modules/client-ip";

const socket = (
  address?: string,
  forwarded?: string | string[],
): { handshake: { address?: string; headers: Record<string, string | string[] | undefined> } } => ({
  handshake: {
    address,
    headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
  },
});

describe("getClientIp", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it("prefers the first forwarded hop over the proxy's own address", () => {
    // Behind the prod reverse proxy handshake.address is the proxy for every
    // client; taking it first would flag every match as same-network.
    expect(getClientIp(socket("10.0.0.7", "203.0.113.9, 10.0.0.7"))).toBe(
      "203.0.113.9",
    );
    expect(getClientIp(socket("10.0.0.7", ["198.51.100.4", "10.0.0.7"]))).toBe(
      "198.51.100.4",
    );
  });

  it("falls back to the socket address when no header is present", () => {
    expect(getClientIp(socket("203.0.113.5"))).toBe("203.0.113.5");
  });

  it("unwraps IPv4-mapped IPv6 addresses", () => {
    expect(getClientIp(socket("::ffff:203.0.113.5"))).toBe("203.0.113.5");
  });

  it("returns null for a proxy-local address when TRUST_PROXY is set", () => {
    process.env.TRUST_PROXY = "1";
    expect(getClientIp(socket("10.0.0.7"))).toBeNull();
    expect(getClientIp(socket("::1"))).toBeNull();
    // A real forwarded hop still wins.
    expect(getClientIp(socket("10.0.0.7", "203.0.113.9"))).toBe("203.0.113.9");
  });

  it("handles a missing handshake", () => {
    expect(getClientIp(null)).toBeNull();
    expect(getClientIp({})).toBeNull();
  });

  it("classifies private and loopback ranges", () => {
    for (const ip of ["10.1.2.3", "192.168.0.4", "172.16.9.9", "127.0.0.1", "::1", "fd00::1"]) {
      expect(isPrivateOrLoopback(ip)).toBe(true);
    }
    for (const ip of ["203.0.113.5", "8.8.8.8", "2606:4700::1111"]) {
      expect(isPrivateOrLoopback(ip)).toBe(false);
    }
  });
});

describe("hashIp / resolveClientIpHash", () => {
  afterEach(() => {
    delete process.env.IP_HASH_SALT;
  });

  it("is deterministic, salted, and never leaks the raw address", () => {
    const a = hashIp("203.0.113.5", "pepper");
    expect(a).toBe(hashIp("203.0.113.5", "pepper"));
    expect(a).not.toBe(hashIp("203.0.113.5", "other-pepper"));
    expect(a).not.toBe(hashIp("203.0.113.6", "pepper"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203.0.113.5");
  });

  it("returns null when no salt is configured so the guard stays inert", () => {
    const saved = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    try {
      expect(resolveClientIpHash(socket("203.0.113.5"))).toBeNull();
      process.env.IP_HASH_SALT = "pepper";
      expect(resolveClientIpHash(socket("203.0.113.5"))).toBe(
        hashIp("203.0.113.5", "pepper"),
      );
    } finally {
      if (saved !== undefined) process.env.NEXTAUTH_SECRET = saved;
    }
  });
});

describe("resolveSameNetworkGuard", () => {
  it("exempts development and test so a localhost ladder stays testable", () => {
    expect(resolveSameNetworkGuard(undefined, "development")).toBe(false);
    expect(resolveSameNetworkGuard(undefined, "test")).toBe(false);
    expect(resolveSameNetworkGuard(undefined, "TEST")).toBe(false);
  });

  it("keeps the guard on in production", () => {
    expect(resolveSameNetworkGuard(undefined, "production")).toBe(true);
  });

  it("fails safe when NODE_ENV is unset or unrecognised", () => {
    expect(resolveSameNetworkGuard(undefined, undefined)).toBe(true);
    expect(resolveSameNetworkGuard(undefined, "")).toBe(true);
    expect(resolveSameNetworkGuard(undefined, "staging")).toBe(true);
  });

  it("lets an explicit setting win in both directions", () => {
    expect(resolveSameNetworkGuard("off", "production")).toBe(false);
    expect(resolveSameNetworkGuard("false", "production")).toBe(false);
    expect(resolveSameNetworkGuard("0", "production")).toBe(false);
    expect(resolveSameNetworkGuard("on", "development")).toBe(true);
    expect(resolveSameNetworkGuard("true", "development")).toBe(true);
    expect(resolveSameNetworkGuard("1", "test")).toBe(true);
  });

  it("treats an unparseable setting as on rather than silently dropping the guard", () => {
    expect(resolveSameNetworkGuard("maybe", "production")).toBe(true);
    expect(resolveSameNetworkGuard("   ", "development")).toBe(false);
  });
});
