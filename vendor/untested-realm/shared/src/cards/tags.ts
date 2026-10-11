import raw from './tags.json'

/** One entry in the mechanic-tag taxonomy (from the sorcery-rag `card_tags` table,
 *  baked offline by scripts/export_tags.py). `count` = cards carrying the tag. */
export interface TagInfo {
  tag: string
  category: string
  count: number
}

interface TagData {
  taxonomy: TagInfo[]
  cards: Record<string, string[]>
}

const data = raw as TagData

/** Every mechanic tag, ordered by frequency (most common first). */
export const tagTaxonomy: readonly TagInfo[] = data.taxonomy

/** category → its tags (sorted by frequency, from the taxonomy order). */
export const tagsByCategory: Readonly<Record<string, TagInfo[]>> = (() => {
  const m: Record<string, TagInfo[]> = {}
  for (const t of data.taxonomy) (m[t.category] ??= []).push(t)
  return m
})()

const byName: Record<string, string[]> = data.cards
// lower-cased lookup so tag queries match regardless of the caller's casing
const lower: Map<string, string[]> = new Map(Object.entries(byName).map(([n, t]) => [n.toLowerCase(), t]))

/** The mechanic tags a card carries (empty array if the card is untagged/unknown). */
export function cardTags(name: string): string[] {
  return lower.get(name.toLowerCase()) ?? []
}

/** Does a card carry a given mechanic tag? */
export function hasTag(name: string, tag: string): boolean {
  return cardTags(name).includes(tag)
}

/** The category a tag belongs to (or undefined if it isn't in the taxonomy). */
const catOf = new Map(data.taxonomy.map((t) => [t.tag, t.category]))
export function tagCategory(tag: string): string | undefined {
  return catOf.get(tag)
}
