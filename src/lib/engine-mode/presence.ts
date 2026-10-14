"use client";

import { useEffect, useState } from "react";
import { FEATURE_ENGINE_MODE } from "@/lib/config/features";
import {
  PRESENCE_API_PATH,
  PRESENCE_HEARTBEAT_MS,
  presenceCountFromBody,
} from "@/lib/engine-mode/presenceStore";

/** How often the lobby re-reads the count while it is visible (matches its lobby-list poll). */
export const PRESENCE_POLL_MS = 30_000;

function newPresenceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  // insecure contexts (plain http on a LAN address) have no randomUUID
  let id = "";
  while (id.length < 32) id += Math.random().toString(36).slice(2);
  return id.slice(0, 32);
}

function sendPresence(method: "POST" | "DELETE", id: string): void {
  try {
    void fetch(PRESENCE_API_PATH, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      // keepalive lets the final DELETE leave with a closing tab
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
  } catch {}
}

/**
 * Announce a rules-engine game to the lobby's activity count while `active`
 * (a game is on the board and not yet over). Sends only a random id that lives
 * as long as this game; stops - and withdraws the id - when the game ends, the
 * page is left or the tab closes. A closed tab that could not say goodbye
 * drops out on the server's TTL.
 */
export function useEngineGamePresence(
  active: boolean,
  enabled: boolean = FEATURE_ENGINE_MODE,
): void {
  const on = enabled && active;
  useEffect(() => {
    if (!on) return;
    const id = newPresenceId();
    sendPresence("POST", id);
    const timer = window.setInterval(
      () => sendPresence("POST", id),
      PRESENCE_HEARTBEAT_MS,
    );
    // Closing or navigating away; a page restored from the back/forward cache
    // re-announces itself on the next heartbeat.
    const onPageHide = () => sendPresence("DELETE", id);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      sendPresence("DELETE", id);
    };
  }, [on]);
}

/**
 * Number of rules-engine games in progress right now, re-read every
 * PRESENCE_POLL_MS while the page is visible and on returning to the tab.
 * Always 0 when engine mode is off. Needs no sign-in or socket.
 */
export function useEngineGamesCount(
  enabled: boolean = FEATURE_ENGINE_MODE,
): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(PRESENCE_API_PATH, { cache: "no-store" });
        if (!res.ok) return;
        const next = presenceCountFromBody(await res.json());
        if (!cancelled && next !== null) setCount(next);
      } catch {}
    };
    void load();
    const timer = window.setInterval(() => void load(), PRESENCE_POLL_MS);
    const onVisibilityChange = () => void load();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);
  return enabled ? count : 0;
}
