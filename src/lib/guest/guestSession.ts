/**
 * Client-side guest identity store.
 *
 * Mirrors the httpOnly guest cookie (see guest-session.server.ts) so React can
 * decide whether an account-less visitor may connect to online play. The
 * cookie itself is the credential; this module only knows the public profile.
 */

import { useEffect, useSyncExternalStore } from "react";
import { clearSocketTokenCache } from "@/lib/net/socketTokenCache";

export interface GuestProfile {
  id: string;
  name: string;
}

export interface GuestSessionState {
  status: "loading" | "ready";
  guest: GuestProfile | null;
}

let state: GuestSessionState = { status: "loading", guest: null };
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

// A stable reference so useSyncExternalStore never sees a new server snapshot
const SERVER_SNAPSHOT: GuestSessionState = { status: "loading", guest: null };

function setState(next: GuestSessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toProfile(raw: unknown): GuestProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const { id, name } = raw as { id?: unknown; name?: unknown };
  return typeof id === "string" && typeof name === "string"
    ? { id, name }
    : null;
}

/** Fetch the current guest profile once; later calls share the same promise. */
export function loadGuestSession(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch("/api/guest/session", {
        cache: "no-store",
        credentials: "include",
      });
      const data = res.ok ? await res.json() : null;
      setState({ status: "ready", guest: toProfile(data?.guest) });
    } catch {
      setState({ status: "ready", guest: null });
    }
  })();
  return loadPromise;
}

export async function createGuestSession(name: string): Promise<GuestProfile> {
  const res = await fetch("/api/guest/session", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Could not start guest session",
    );
  }
  const guest = toProfile(data?.guest);
  if (!guest) throw new Error("Could not start guest session");
  // Any stale socket token must not outlive the identity it was minted for
  clearSocketTokenCache();
  setState({ status: "ready", guest });
  return guest;
}

export async function clearGuestSession(): Promise<void> {
  try {
    await fetch("/api/guest/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch {}
  clearSocketTokenCache();
  setState({ status: "ready", guest: null });
}

export function useGuestSession(): GuestSessionState {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_SNAPSHOT,
  );
  useEffect(() => {
    void loadGuestSession();
  }, []);
  return snapshot;
}
