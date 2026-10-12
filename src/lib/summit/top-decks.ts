/**
 * The top 8 of the most recent Sorcerers Summit tournament — what sorcererssummit.com/top-8 shows.
 *
 * Source: their postseason BRACKETS.
 *   GET /api/brackets              — every bracket; the newest completed one wins
 *   GET /api/brackets/{slug}       — entrants and rounds. Summit titles its rounds, so the
 *                                    "Quarterfinals" participants ARE the top eight.
 *   GET /api/brackets/{slug}/decks — each entrant's submitted deck, with a visibility flag
 * The detail routes take the bracket's SLUG; the numeric `bracket_id` 404s.
 *
 * These are decks players deliberately submitted to a tournament and marked public — not
 * anything read out of a private profile. We still honour `deck_visible`/`visibility` and skip
 * anyone who did not publish theirs. All we keep is the deck's own public URL (sorcerytcg.com
 * or curiosa.io), which is exactly what our ordinary deck importer already accepts.
 */

import { getCached, setCached } from "@/lib/cache/redis-cache";

const BASE = "https://www.sorcererssummit.com/api";
const CACHE_KEY = "summit:top-decks:v2";
/** Brackets change rarely; a week of cache behind a Monday refresh is plenty. */
const CACHE_TTL_SECONDS = 8 * 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 15_000;
/** The round whose players are, by definition, the top eight. */
const TOP8_ROUND_TITLE = /quarter/i;

export interface SummitTopDeck {
  player: string;
  avatar: string | null;
  deckName: string | null;
  /** a public deck page (sorcerytcg.com / curiosa.io) — the only thing we keep */
  url: string;
  seed: number | null;
  /** 1 champion, 2 runner-up, 4 losing semifinalist, 8 otherwise */
  placing: number;
}

export interface SummitTopDecks {
  bracketSlug: string;
  bracketName: string;
  champion: string | null;
  completedAt: string | null;
  decks: SummitTopDeck[];
  fetchedAt: string;
  /**
   * The newest finished tournament at the time of the fetch, whether or not it had decks.
   * The weekly job compares against this to decide if anything happened at all.
   */
  seenBracket: { slug: string; completedAt: string | null } | null;
}

export interface BracketSummary {
  bracket_id: number;
  slug: string;
  name: string;
  status: string;
  completed_at: string | null;
  champion: { display_name?: string } | null;
}

interface BracketMatch {
  round: number;
  p1_user_id?: string | null;
  p2_user_id?: string | null;
  winner_user_id?: string | null;
}

export interface BracketDetail {
  champion?: { display_name?: string; user_id?: string } | null;
  rounds?: { round: number; title?: string; matches: BracketMatch[] }[];
}

interface BracketDeckPlayer {
  user_id?: string;
  display_name?: string;
  avatar_name?: string | null;
  deck_name?: string | null;
  deck_url?: string | null;
  deck_visible?: boolean;
  visibility?: string;
  seed?: number | null;
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

/** Finished brackets, newest first. */
export function completedBrackets(brackets: BracketSummary[]): BracketSummary[] {
  return brackets
    .filter((b) => b.status === "complete" && b.completed_at && b.slug)
    .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""));
}

/** The newest bracket that has actually finished. */
export function latestCompletedBracket(brackets: BracketSummary[]): BracketSummary | null {
  return completedBrackets(brackets)[0] ?? null;
}

/**
 * Who finished in the top eight, and how far each got.
 *
 * Read from the bracket's own structure rather than guessed from seeds — a 14th seed won one
 * of these. Everyone who played a quarterfinal is top 8; later rounds promote them.
 */
export function top8Placings(detail: BracketDetail): Map<string, number> {
  const placings = new Map<string, number>();
  const rounds = detail.rounds ?? [];
  const quarters = rounds.find((r) => TOP8_ROUND_TITLE.test(r.title ?? ""));
  if (!quarters) return placings;

  const enter = (id: string | null | undefined, placing: number) => {
    if (!id) return;
    const existing = placings.get(id);
    if (existing === undefined || placing < existing) placings.set(id, placing);
  };

  for (const m of quarters.matches) {
    enter(m.p1_user_id, 8);
    enter(m.p2_user_id, 8);
  }
  for (const round of rounds) {
    if (round.round <= quarters.round) continue;
    const placing = round.matches.length === 1 ? 2 : 4; // the final, else the semifinals
    for (const m of round.matches) {
      enter(m.p1_user_id, placing);
      enter(m.p2_user_id, placing);
      if (placing === 2 && m.winner_user_id) enter(m.winner_user_id, 1);
    }
  }
  return placings;
}

/** A deck page we can actually hand to our importer. */
export function isPublicDeckUrl(url: string): boolean {
  return /^https:\/\/(www\.)?(sorcerytcg\.com|curiosa\.io)\/decks\//i.test(url);
}

/** Build the list from a bracket's rounds and its submitted decks. */
export function buildTopDecks(detail: BracketDetail, players: BracketDeckPlayer[]): SummitTopDeck[] {
  const placings = top8Placings(detail);
  const decks: SummitTopDeck[] = [];
  for (const player of players) {
    const placing = player.user_id ? placings.get(player.user_id) : undefined;
    if (placing === undefined) continue; // not in the top 8
    const url = player.deck_url ?? "";
    if (!url || !isPublicDeckUrl(url)) continue;
    // never republish a deck its owner did not publish
    if (player.deck_visible === false) continue;
    if (player.visibility && player.visibility !== "public") continue;
    decks.push({
      player: player.display_name || "Unknown",
      avatar: player.avatar_name ?? null,
      deckName: player.deck_name ?? null,
      url,
      seed: player.seed ?? null,
      placing,
    });
  }
  return decks.sort((a, b) => a.placing - b.placing || (a.seed ?? 99) - (b.seed ?? 99));
}

/**
 * Walk finished brackets newest-first until one actually has decks.
 *
 * Submitting a decklist is optional, and the most recent tournament frequently has none at
 * all — measured live, the newest completed bracket had 24 entrants and 0 decks while the one
 * before it had 24 of 24. Stopping at the newest would have shipped an empty list.
 * `depth` bounds both the walk and the number of requests we make of Summit.
 */
export async function fetchSummitTopDecks(depth = 4): Promise<SummitTopDecks | null> {
  const list = await summitGet<{ brackets: BracketSummary[] }>("/brackets");
  if (!list?.brackets) return null;

  const finished = completedBrackets(list.brackets);
  const newest = finished[0] ?? null;

  for (const bracket of finished.slice(0, depth)) {
    const slug = encodeURIComponent(bracket.slug);
    const [detail, deckList] = await Promise.all([
      summitGet<BracketDetail>(`/brackets/${slug}`),
      summitGet<{ players?: BracketDeckPlayer[] }>(`/brackets/${slug}/decks`),
    ]);
    if (!detail || !deckList?.players?.length) continue;

    const decks = buildTopDecks(detail, deckList.players);
    if (!decks.length) continue; // nobody published a decklist for that one

    return {
      bracketSlug: bracket.slug,
      bracketName: bracket.name,
      champion: bracket.champion?.display_name ?? detail.champion?.display_name ?? null,
      completedAt: bracket.completed_at,
      decks,
      fetchedAt: new Date().toISOString(),
      seenBracket: newest ? { slug: newest.slug, completedAt: newest.completed_at } : null,
    };
  }
  return null;
}

/** Has a tournament finished since the cached list was built? */
export function hasNewTournament(cached: SummitTopDecks | null, brackets: BracketSummary[]): boolean {
  const newest = completedBrackets(brackets)[0];
  if (!newest) return false;
  if (!cached?.seenBracket) return true;
  return cached.seenBracket.slug !== newest.slug || cached.seenBracket.completedAt !== newest.completed_at;
}

export async function getCachedSummitTopDecks(): Promise<SummitTopDecks | null> {
  return (await getCached<SummitTopDecks>(CACHE_KEY)) ?? null;
}

export interface RefreshOutcome {
  /** "fetched" replaced the list, "unchanged" means no new tournament has finished */
  status: "fetched" | "unchanged" | "empty";
  decks: SummitTopDecks | null;
}

/**
 * The weekly job. It asks one cheap question first — has a tournament finished since last
 * time? — and does nothing further if not, so the usual Monday costs a single request and
 * leaves the standing list alone. When a new one HAS finished, the fresh top 8 replaces the
 * cached list wholesale, which is what retires the previous event's decks.
 */
export async function refreshSummitTopDecks(force = false): Promise<RefreshOutcome> {
  const cached = await getCachedSummitTopDecks();
  if (!force) {
    const list = await summitGet<{ brackets: BracketSummary[] }>("/brackets");
    if (!list?.brackets) return { status: "unchanged", decks: cached };
    if (!hasNewTournament(cached, list.brackets)) return { status: "unchanged", decks: cached };
  }
  const fresh = await fetchSummitTopDecks();
  if (!fresh) return { status: "empty", decks: cached };
  await setCached(CACHE_KEY, fresh, { ttl: CACHE_TTL_SECONDS });
  return { status: "fetched", decks: fresh };
}
