/**
 * Top-8 decklists from the most recent OFFLINE tournament, as collected on
 * sorcererssummit.com/top-8 (SCG events, Grand Contests, Cornerstones and the like).
 *
 *   GET /api/top-8-events     — every collected event: folder, name, date, player_count,
 *                               has_top8, winner. The `folder` is the id used below.
 *   GET /api/events/{folder}  — that event's `top8_decks`, each with a `deck_id`
 *
 * These are NOT Summit's own ELO seasons or postseason brackets: those are their online
 * league. A `deck_id` is a deck on sorcerytcg.com, which is where the lists are published
 * and what our ordinary deck importer already accepts — all we keep is that public URL.
 *
 * The weekly job asks one cheap question first: has a new event been collected since last
 * time? If not it does nothing, so the standing list only changes when a real tournament has
 * been added, and the previous event's decks are retired by being replaced wholesale.
 */

import { getCached, setCached } from "@/lib/cache/redis-cache";

const BASE = "https://www.sorcererssummit.com/api";
const CACHE_KEY = "summit:top-decks:v3";
const CACHE_TTL_SECONDS = 40 * 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 15_000;
/** Where a `deck_id` resolves to. */
const DECK_BASE = "https://sorcerytcg.com/decks/";

export interface SummitTopDeck {
  player: string;
  avatar: string | null;
  deckName: string | null;
  /** the public deck page our importer takes */
  url: string;
  elements: string[];
  /** 1..8 where the event named a placing, else null */
  placing: number | null;
}

export interface SummitTopDecks {
  folder: string;
  eventName: string;
  eventDate: string | null;
  playerCount: number | null;
  winner: string | null;
  decks: SummitTopDeck[];
  fetchedAt: string;
}

export interface SummitEventSummary {
  folder: string;
  name: string;
  event_date: string | null;
  player_count?: number | null;
  has_top8?: boolean;
  winner_username?: string | null;
}

interface EventDeck {
  player?: string;
  avatar?: string | null;
  deck_name?: string | null;
  deck_id?: string | null;
  elements?: string[];
}

interface EventDetail {
  event_name?: string;
  event_folder?: string;
  top8_decks?: EventDeck[];
  all_decks?: EventDeck[];
}

function apiKey(): string | null {
  return process.env.SORCERERS_SUMMIT_API_KEY || null;
}

async function summitGet<T>(path: string): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "X-API-Key": key,
        Accept: "application/json",
        // Summit answers some default agents with a 403; say who we actually are.
        "User-Agent": "realms.cards (+https://realms.cards)",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // upstream hiccups must never break the caller
  } finally {
    clearTimeout(timer);
  }
}

/** Collected events that actually have a top 8 and a date, newest first. */
export function datedEvents(events: SummitEventSummary[]): SummitEventSummary[] {
  return events
    .filter((e) => e.folder && e.event_date && e.has_top8 !== false)
    .sort((a, b) => Date.parse(b.event_date ?? "") - Date.parse(a.event_date ?? ""));
}

/** Has a newer event been collected than the one we already published? */
export function hasNewEvent(cached: SummitTopDecks | null, events: SummitEventSummary[]): boolean {
  const newest = datedEvents(events)[0];
  if (!newest) return false;
  if (!cached) return true;
  return cached.folder !== newest.folder;
}

/**
 * The placing an event encodes in a deck's name ("… - Champion", "… - 3rd Place").
 * Events that name the player instead ("… - Jeremy Murray") simply have no placing.
 */
export function placingFromName(deckName: string | null | undefined): number | null {
  if (!deckName) return null;
  const tail = deckName.split(" - ").pop() ?? "";
  if (/champion|1st/i.test(tail)) return 1;
  const ordinal = /(\d+)(?:st|nd|rd|th)\s*place/i.exec(tail);
  if (ordinal) {
    const n = Number(ordinal[1]);
    if (n >= 1 && n <= 8) return n;
  }
  return null;
}

export function buildEventDecks(detail: EventDetail): SummitTopDeck[] {
  const source = detail.top8_decks?.length ? detail.top8_decks : (detail.all_decks ?? []);
  const decks: SummitTopDeck[] = [];
  for (const deck of source) {
    if (!deck?.deck_id) continue;
    decks.push({
      player: deck.player || "Unknown",
      avatar: deck.avatar ?? null,
      deckName: deck.deck_name ?? null,
      url: `${DECK_BASE}${deck.deck_id}`,
      elements: deck.elements ?? [],
      placing: placingFromName(deck.deck_name),
    });
  }
  // placed decks first, in order; anything unplaced keeps its original position behind them
  return decks.sort((a, b) => (a.placing ?? 99) - (b.placing ?? 99));
}

/**
 * Walk collected events newest-first until one yields decks. `depth` bounds both the walk and
 * the number of requests we make of Summit.
 */
export async function fetchSummitTopDecks(depth = 3): Promise<SummitTopDecks | null> {
  const list = await summitGet<{ events: SummitEventSummary[] }>("/top-8-events");
  if (!list?.events) return null;

  for (const event of datedEvents(list.events).slice(0, depth)) {
    const detail = await summitGet<EventDetail>(`/events/${encodeURIComponent(event.folder)}`);
    if (!detail) continue;
    const decks = buildEventDecks(detail);
    if (!decks.length) continue;
    return {
      folder: event.folder,
      eventName: detail.event_name || event.name,
      eventDate: event.event_date,
      playerCount: event.player_count ?? null,
      winner: event.winner_username ?? null,
      decks,
      fetchedAt: new Date().toISOString(),
    };
  }
  return null;
}

export async function getCachedSummitTopDecks(): Promise<SummitTopDecks | null> {
  return (await getCached<SummitTopDecks>(CACHE_KEY)) ?? null;
}

export interface RefreshOutcome {
  status: "fetched" | "unchanged" | "empty";
  decks: SummitTopDecks | null;
}

export async function refreshSummitTopDecks(force = false): Promise<RefreshOutcome> {
  const cached = await getCachedSummitTopDecks();
  if (!force) {
    const list = await summitGet<{ events: SummitEventSummary[] }>("/top-8-events");
    if (!list?.events) return { status: "unchanged", decks: cached };
    if (!hasNewEvent(cached, list.events)) return { status: "unchanged", decks: cached };
  }
  const fresh = await fetchSummitTopDecks();
  if (!fresh) return { status: "empty", decks: cached };
  await setCached(CACHE_KEY, fresh, { ttl: CACHE_TTL_SECONDS });
  return { status: "fetched", decks: fresh };
}
