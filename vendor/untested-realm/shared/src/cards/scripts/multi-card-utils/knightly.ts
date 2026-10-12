import { getCard } from '../../db'

// "a Knight, Sir, or Dame" — an Arthurian Legends NAMING convention, not a subtype: almost none of
// these minions carry a "Knight" subtype (Black/Blue/Yellow/White/Death/Green/Brother/Vanguard Knights,
// every "Sir …", every "Dame …" are printed as Mortals). So we match the word Knight/Sir/Dame — SINGULAR
// OR PLURAL ("Vanguard Knights") — anywhere in the card name, plus a literal Knight subtype as a safety
// net. Shared by The Round Table, Templar, Tournament Grounds and Knighthood so they all agree.
export function isKnightSirDame(name: string): boolean {
  if (/\b(Knight|Sir|Dame)s?\b/.test(name)) return true
  const subs = getCard(name).subtypes
  return Array.isArray(subs) ? subs.includes('Knight') : String(subs ?? '').includes('Knight')
}
