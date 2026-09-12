"use strict";

import { createHash } from "crypto";
import { parseBoolean } from "../core/config";

/**
 * Client IP resolution + salted hashing for the ladder's same-network guard.
 *
 * Behind the production reverse proxy `socket.handshake.address` is the proxy
 * for every client, so the first `x-forwarded-for` hop must win. Raw IPs are
 * never stored: only a salted sha256 prefix travels to the database.
 */

interface HandshakeLike {
  address?: string | null;
  headers?: Record<string, string | string[] | undefined>;
}

export interface SocketLike {
  handshake?: HandshakeLike | null;
}

const PRIVATE_V4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

export function isPrivateOrLoopback(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "localhost") return true;
  if (PRIVATE_V4.test(ip)) return true;
  const lower = ip.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

/**
 * Best-effort client IP. Returns null when the address cannot be attributed
 * to the client (behind a trusted proxy without a forwarded header).
 */
export function getClientIp(socket: SocketLike | null | undefined): string | null {
  const handshake = socket?.handshake;
  if (!handshake) return null;
  const forwardedRaw = handshake.headers?.["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedRaw) ? forwardedRaw[0] : forwardedRaw;
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0];
    const ip = normalizeIp(first);
    if (ip) return ip;
  }
  const address =
    typeof handshake.address === "string" ? normalizeIp(handshake.address) : "";
  if (!address) return null;
  const trustProxy = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";
  if (trustProxy && isPrivateOrLoopback(address)) return null;
  return address;
}

export function getIpHashSalt(): string | null {
  const salt = process.env.IP_HASH_SALT || process.env.NEXTAUTH_SECRET || "";
  return salt ? salt : null;
}

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Whether the ladder's same-network guard should actually void a match.
 *
 * In development and test every client is on localhost, so the guard would
 * mark literally every match unrated and make the ladder untestable. Those
 * environments are therefore exempt by default. Production is never exempt,
 * and an UNSET or unrecognised NODE_ENV keeps the guard ON so a misconfigured
 * deployment fails safe rather than silently dropping the protection.
 *
 * An explicit LADDER_SAME_NETWORK_GUARD always wins in both directions, so a
 * dev box can opt back in to verify the guard itself.
 */
export function resolveSameNetworkGuard(
  setting: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  if (typeof setting === "string" && setting.trim() !== "") {
    return parseBoolean(setting, true);
  }
  const env = (nodeEnv ?? "").trim().toLowerCase();
  return env !== "development" && env !== "test";
}

export function isSameNetworkGuardEnabled(): boolean {
  return resolveSameNetworkGuard(
    process.env.LADDER_SAME_NETWORK_GUARD,
    process.env.NODE_ENV,
  );
}

/** Salted hash of the socket's client IP, or null when unknown / no salt configured. */
export function resolveClientIpHash(socket: SocketLike | null | undefined): string | null {
  const salt = getIpHashSalt();
  if (!salt) return null;
  const ip = getClientIp(socket);
  if (!ip) return null;
  return hashIp(ip, salt);
}
