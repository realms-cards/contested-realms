"use client";

import { useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type { CustomSelectOption } from "@/components/ui/CustomSelect";
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
  publicDecks: DeckListEntry[];
}

/** Fetch the viewer's decks once; guests and offline dev get only the built-in precons. */
export function useDeckLists(): DeckLists {
  const [lists, setLists] = useState<DeckLists>({ mine: [], publicDecks: [] });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/decks", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ myDecks?: DeckListEntry[]; publicDecks?: DeckListEntry[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setLists({ mine: data.myDecks ?? [], publicDecks: data.publicDecks ?? [] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return lists;
}

/** "random" picks a built-in precon at start; "link" means a sorcerytcg.com / Curiosa URL. */
export type DeckChoice = string;
export const RANDOM_PRECON = "random";
const LINK = "link";

const withAvatar = (d: DeckListEntry) => (d.avatarCard?.name ? `${d.name} — ${d.avatarCard.name}` : d.name);

export function deckOptions(lists: DeckLists, allowRandom: boolean): CustomSelectOption[] {
  return [
    ...(allowRandom ? [{ value: RANDOM_PRECON, label: "Random Beta precon" }] : []),
    ...enginePrecons.map((d) => ({ value: `builtin:${d.id}`, label: `${d.name} — ${d.avatar}` })),
    ...lists.mine.map((d) => ({ value: `saved:${d.id}`, label: `Your deck: ${withAvatar(d)}` })),
    ...lists.publicDecks.map((d) => ({ value: `saved:${d.id}`, label: `Precon: ${withAvatar(d)}` })),
    { value: LINK, label: "Import from a sorcerytcg.com / Curiosa link…" },
  ];
}

/** Resolve a picker choice to a loadable source; null while a link is still empty. */
export function choiceToSource(choice: DeckChoice, link: string, lists: DeckLists): DeckSource | null {
  if (choice === RANDOM_PRECON) {
    const precon = enginePrecons[Math.floor(Math.random() * enginePrecons.length)];
    return { kind: "builtin", id: precon.id ?? "" };
  }
  if (choice === LINK) return link.trim() ? { kind: "link", url: link.trim() } : null;
  if (choice.startsWith("builtin:")) return { kind: "builtin", id: choice.slice("builtin:".length) };
  const id = choice.slice("saved:".length);
  const entry = [...lists.mine, ...lists.publicDecks].find((d) => d.id === id);
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
      <CustomSelect value={value} onChange={onChange} options={deckOptions(lists, allowRandom)} />
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
