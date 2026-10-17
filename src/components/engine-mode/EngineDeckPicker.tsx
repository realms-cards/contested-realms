"use client";

import { useCallback, useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type { CustomSelectOption } from "@/components/ui/CustomSelect";
import {
  fetchPublicDecks,
  fetchTopDecks,
  isTop8Value,
  top8Label,
  top8Title,
  top8Url,
  top8Value,
  type PublicDeckListEntry,
  type SummitTopDecks,
} from "@/lib/decks/deckCategories";
import type { DeckSource } from "@/lib/engine-mode/decks";
import { enginePrecons } from "@/lib/engine-mode/decks";

/** One row of GET /api/decks (own decks and the public precons). */
export interface DeckListEntry {
  id: string;
  name: string;
  avatarCard?: { name: string } | null;
}

export interface DeckLists {
  mine: DeckListEntry[];
  /** the saved precons (GET /api/decks `publicDecks`) */
  publicDecks: DeckListEntry[];
  /** the latest offline event's top 8 — sorcerytcg.com links, played like an imported link */
  top?: SummitTopDecks | null;
  /** other players' public decks; null until asked for (lazy) */
  others?: PublicDeckListEntry[] | null;
  othersLoading?: boolean;
  loadOthers?: () => void;
}

/** Fetch the viewer's decks once; guests and offline dev get only the built-in precons. */
export function useDeckLists(): DeckLists {
  const [lists, setLists] = useState<Pick<DeckLists, "mine" | "publicDecks">>({ mine: [], publicDecks: [] });
  const [top, setTop] = useState<SummitTopDecks | null>(null);
  const [others, setOthers] = useState<PublicDeckListEntry[] | null>(null);
  const [othersLoading, setOthersLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/decks", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ myDecks?: DeckListEntry[]; publicDecks?: DeckListEntry[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setLists({ mine: data.myDecks ?? [], publicDecks: data.publicDecks ?? [] });
      })
      .catch(() => undefined);
    void fetchTopDecks().then((t) => {
      if (!cancelled) setTop(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const loadOthers = useCallback(() => {
    if (others || othersLoading) return;
    setOthersLoading(true);
    fetchPublicDecks()
      .then(setOthers)
      .catch(() => setOthers([]))
      .finally(() => setOthersLoading(false));
  }, [others, othersLoading]);
  return { ...lists, top, others, othersLoading, loadOthers };
}

/** "random" picks a built-in precon at start; "link" means a sorcerytcg.com / Curiosa URL. */
export type DeckChoice = string;
export const RANDOM_PRECON = "random";
const LINK = "link";
/** picker entries that are actions, not decks */
const LOAD_PUBLIC = "__load_public__";
const NO_PUBLIC = "__no_public__";

const withAvatar = (d: DeckListEntry) => (d.avatarCard?.name ? `${d.name} — ${d.avatarCard.name}` : d.name);

export function deckOptions(lists: DeckLists, allowRandom: boolean): CustomSelectOption[] {
  const others = lists.others;
  const top = lists.top;
  return [
    ...lists.mine.map((d) => ({ value: `saved:${d.id}`, label: withAvatar(d), group: "Your decks" })),
    ...(allowRandom ? [{ value: RANDOM_PRECON, label: "Random Beta precon", group: "Precons" }] : []),
    ...enginePrecons.map((d) => ({ value: `builtin:${d.id}`, label: `${d.name} — ${d.avatar}`, group: "Precons" })),
    ...lists.publicDecks.map((d) => ({ value: `saved:${d.id}`, label: withAvatar(d), group: "Precons" })),
    ...(top ? top.decks.map((d) => ({ value: top8Value(d), label: top8Label(d), group: top8Title(top) })) : []),
    ...(others === undefined
      ? []
      : others === null
        ? [{
            value: LOAD_PUBLIC,
            label: lists.othersLoading ? "Loading public decks…" : "Show other players' public decks…",
            group: "Public decks",
          }]
        : others.length
          ? others.map((d) => ({ value: `saved:${d.id}`, label: `${d.name} — ${d.userName}`, group: "Public decks" }))
          : [{ value: NO_PUBLIC, label: "No public decks from other players yet", group: "Public decks" }]),
    { value: LINK, label: "Import from a sorcerytcg.com / Curiosa link…", group: "Other" },
  ];
}

/** Resolve a picker choice to a loadable source; null while a link is still empty. */
export function choiceToSource(choice: DeckChoice, link: string, lists: DeckLists): DeckSource | null {
  if (choice === RANDOM_PRECON) {
    const precon = enginePrecons[Math.floor(Math.random() * enginePrecons.length)];
    return { kind: "builtin", id: precon.id ?? "" };
  }
  if (choice === LINK) return link.trim() ? { kind: "link", url: link.trim() } : null;
  // a top-8 deck is a sorcerytcg.com link, played exactly like an imported one
  if (isTop8Value(choice)) return { kind: "link", url: top8Url(choice) };
  if (choice.startsWith("builtin:")) return { kind: "builtin", id: choice.slice("builtin:".length) };
  const id = choice.slice("saved:".length);
  const entry = [...lists.mine, ...lists.publicDecks, ...(lists.others ?? [])].find((d) => d.id === id);
  return { kind: "saved", id, name: entry?.name ?? "Deck" };
}

export default function EngineDeckPicker({
  label,
  lists,
  value,
  link,
  allowRandom,
  onChange,
  onLinkChange,
}: {
  label: string;
  lists: DeckLists;
  value: DeckChoice;
  link: string;
  allowRandom: boolean;
  onChange: (value: DeckChoice) => void;
  onLinkChange: (link: string) => void;
}) {
  return (
    <div>
      <div className="rc-field-label mb-2">{label}</div>
      <CustomSelect
        value={value}
        onChange={(v) => {
          if (v === LOAD_PUBLIC) return lists.loadOthers?.();
          if (v === NO_PUBLIC) return;
          onChange(v);
        }}
        options={deckOptions(lists, allowRandom)}
      />
      {value === LINK && (
        <input
          value={link}
          onChange={(e) => onLinkChange(e.target.value)}
          placeholder="https://sorcerytcg.com/decks/…"
          aria-label={`${label} link`}
          className="mt-2 h-9 w-full rounded-rc-md border border-rc-line/22 bg-black/40 px-3 text-sm text-rc-fg placeholder:text-rc-fg-subtle"
        />
      )}
    </div>
  );
}
