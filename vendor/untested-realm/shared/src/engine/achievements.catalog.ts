// The achievement catalog + the direct-award helper. This module imports ONLY types, so any card
// script can call `awardAchievement` without dragging the engine's static-analysis modules into its
// import chain (no cycles). The heavier diff detector lives in achievements.ts and re-exports from here.

import type { GameState, PlayerId } from './types'

export interface AchievementDef {
  id: string
  /** the cheeky unlock title, shown once earned */
  name: string
  /** one-line "how" hint, shown once earned (kept vague while locked) */
  hint: string
  /** not yet auto-detected by the engine (reserved catalog entry) */
  pending?: boolean
}

/** One earned achievement, recorded in flow.achievements for the game it happened in. */
export interface AchvUnlock { id: string; seat: PlayerId; turn: number }

// The full catalog. Every entry is now wired to a detector (diff-based in achievements.ts, or a direct
// awardAchievement call from the relevant card script / engine site).
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ghost-vivien', name: 'Ghost Vivien', hint: 'Activate a cemetery ability on Vivien.' },
  { id: 'zombie-vivien', name: 'Zombie Vivien', hint: 'Revive Vivien by sacrificing a skeleton token.' },
  { id: 'man-eater-bug', name: 'Is this man eater bug?', hint: 'Get a useless flipped card on the field (Vivien copying an unflipped Druid).' },
  { id: 'la-situa', name: 'La Situa', hint: 'Draw at least 5 cards with Necronomiconcert.' },
  { id: 'seven-wonders', name: '7 Wonders', hint: 'Control 7 Monuments in the realm at once.' },
  { id: 'cleanse-with-fire', name: 'Cleanse them with fire', hint: "Hit an enemy Avatar with Vesuvius' explosion." },
  { id: 'gigamoeba', name: 'Gigamoeba', hint: 'Have a Megamoeba or Aethermoeba engulf at least 10 locations.' },
  { id: 'tall-for-stacy', name: "Now you're tall enough for Stacy", hint: 'Stretch an enemy Avatar to occupy at least 3 sites.' },
  { id: 'dinosaur-killer', name: 'Dinosaur killer', hint: 'Cast Craterize two of your turns in a row.' },
  { id: 'spider-power-washing', name: 'Spider power washing', hint: 'Kill a subsurface Root Spider by flooding its site.' },
  { id: 'buried-not-destroyed', name: 'Buried, not destroyed', hint: "Summon a minion that doesn't die instantly with a subsurface Omphalos." },
  { id: 'all-just-for-this', name: 'All just for this', hint: 'Kill a subsurface Root Spider by attacking it with a minion with non-printed Burrowing.' },
  { id: 'death-blow-twister', name: 'Death blow', hint: 'Kill an enemy minion or damage an enemy Avatar with a Chaos Twister landing on their site.' },
  { id: 'cock-sorcery', name: 'Cock sorcery', hint: 'Have 2 Avatars under the same Makeshift Barricade.' },
  { id: 'promotion-denied', name: 'Promotion denied!', hint: 'Summon Mephistopheles without it taking over your Avatar.' },
  { id: 'finwife-wedding', name: "Sadly I don't write the rules, you don't win", hint: 'Have an Avatar and a Finwife on the Wedding Hall.' },
  { id: 'weird-marriage', name: 'Weird place for a marriage', hint: 'Have King Arthur and Queen Guinevere on the same site (not a Wedding Hall).' },
  { id: 'gay-marriage', name: 'Gay marriage', hint: 'Have two Kings, Sirs or Knights on the Wedding Hall.' },
  { id: 'the-real-one', name: "I'm the real one", hint: 'Have an Evil Twin kill its twin (or vice-versa).' },
  { id: 'jesus-evil-twin', name: 'Jesus Christ and its evil twin', hint: 'Have an Evil Twin copy Faith Incarnate.' },
  { id: 'call-an-ambulance', name: 'Call an ambulance', hint: 'Go from 20 to 0 Avatar life in a single turn.' },
  { id: 'but-not-for-me', name: 'But not for me', hint: 'Win the game after brushing with death.' },
  { id: 'back-together', name: 'Back together', hint: 'Give the Meat Hook to the Pudge Butcher.' },
  { id: 'sotother', name: 'Sotother', hint: 'Summon Yog-Sothoth.' },
  { id: 'roll-sanity', name: 'Roll sanity', hint: 'See your opponent summon Yog-Sothoth.' },
  { id: 'lord-yoyo', name: 'Lord yo-yo', hint: 'As Lord of Greed, take back a Rolling Boulder you pushed this turn.' },
  { id: 'friends-until-end', name: 'Friends until the end', hint: 'Deal a death blow to an enemy Avatar with Tawny.' },
  { id: 'trypophobia', name: 'Trypophobia', hint: 'Fill the whole realm with sites.' },
  { id: 'the-reunion', name: 'The reunion', hint: 'Have 10+ units, artifacts, or auras on one square, at least 6 of them yours.' },
  { id: 'emperor-naked', name: 'Emperor is naked', hint: 'Strip at least 4 artifacts carried by an enemy Avatar.' },
  { id: 'tree-hater', name: 'Tree hater', hint: 'Destroy the Roots of Yggdrasil.' },
  { id: 'solo-leveling', name: 'Solo leveling', hint: 'Win by leveling up The Immortal Throne.' },
  { id: 'call-of-siren', name: 'Call of the siren', hint: 'Trigger Thin Ice at end of turn, killing an enemy, with Coy Nixie on/under it.' },
  { id: 'court-too', name: "That's a court too", hint: 'Disable a court minion with Overflowing Court.' },
  { id: 'rip-curiosa', name: 'Now do that in real life', hint: "Rip Erik's Curiosa into pieces." },
  { id: 'like-gambling', name: 'I guess you like gambling', hint: "Win by killing an Avatar with a Lightning Bolt that wasn't a sure hit." },
  { id: 'biblical-plague', name: 'Biblical plague', hint: 'Control at least 6 Locusts on the field.' },
  { id: 'sanpei', name: 'They call you Sanpei', hint: 'Fish an enemy Salmon of Knowledge.' },
  { id: 'horse-tower', name: 'Horse tower', hint: 'Have a unit carrying a unit carrying a unit.' },
  { id: 'bolt-twice', name: 'A Lightning Bolt never strikes twice', hint: 'Cast 2 Lightning Bolts on the same site in one turn.' },
  { id: 'blink-182', name: 'Blink 182', hint: 'Cast Blink twice or more on the same unit in one turn.' },
  { id: 'boulevard-broken', name: 'Boulevard of broken bones', hint: 'Destroy Boulevard of Bones.' },
  { id: 'cat-in-face', name: 'Take this cat in your face', hint: 'Summon a Lugbog Cat on an enemy site with the enemy Avatar in it.' },
  { id: 'linger-that', name: 'Linger that!', hint: 'In one turn, destroy Those Who Linger, its Ghoul, and the Ghoul’s Skeleton.' },
  { id: 'whos-avatar-now', name: "Who's the avatar now?", hint: 'Have a minion with more than 20 power.' },
  // ── batch 2 ──
  { id: 'amelia-witch', name: 'Amelia the witch', hint: 'Have a Broomstick Witch on top of the Vesuvius.' },
  { id: 'flat-earther', name: 'Flat earther', hint: 'Destroy the Magellan Globe.' },
  { id: 'long-lost-brother', name: 'Long lost brother', hint: 'Have an Evil Twin copy Brother Knight.' },
  { id: 'proper-use', name: 'Proper use', hint: 'Use the Bull Whip on Bull Demons of Adum.' },
  { id: 'kinky-mf', name: 'You kinky mf', hint: 'Make a Daperyll Vampire use the Bull Whip.' },
  // ── batch 3 ──
  { id: 'exceptional-sense', name: 'Exceptional sense', hint: 'Use Common Sense to fetch another Common Sense.' },
  { id: 'elite-sense', name: 'Elite sense', hint: 'Fetch Common Sense with Common Sense twice in one turn.' },
  { id: 'unique-sense', name: 'Unique sense', hint: 'Fetch Common Sense with Common Sense three times in one turn.' },
  { id: 'hitting-yourself', name: 'Why are you hitting yourself?', hint: "Reach death's door (or die) on a turn your opponent pilots you via Courtesan Thaïs." },
  { id: 'true-elementalist', name: 'True elementalist', hint: 'Have at least 4 thresholds of every element at once.' },
  { id: 'anime-betrayals', name: 'Top 10 anime betrayals', hint: 'Attack the enemy Avatar with a minion you took via Betrayal.' },
  { id: 'mass-desertion', name: 'Mass desertion', hint: 'Take control of more than 3 enemy minions at once.' },
  { id: 'our-spellbook', name: 'Your spellbook? Our spellbook!', hint: "Play a card from your opponent's deck (Lilith, Captain Baldassarre…)." },
  { id: 'kink-of-realm', name: 'Kink of the realm', hint: 'Use a whip effect on the King of the Realm.' },
  { id: 'nuclear-option', name: 'The nuclear option', hint: 'Kill both Avatars at once with a single blast (Craterize, Doomsday, Holy Nova, an explosion).' },
  // a UI achievement (not game-detected): awarded client-side when the player switches the home screen
  // to the hand-drawn "meme" cover (⚙ Settings → Homepage quality → Low).
  { id: 'paint-supremacy', name: 'Paint supremacy', hint: 'Reveal the low quality homepage.' },
]

export const BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))
export function achievementDef(id: string): AchievementDef | undefined { return BY_ID[id] }

/**
 * Directly award an achievement to a seat from anywhere in the engine / a card script. Used for the
 * feats a pure prev→next diff can't see — the card's own script knows exactly why/when its condition
 * fired (a kill cause, a copy target, a spawn lineage, a skipped takeover branch, …). Dedupes per
 * game like the diff detector; the client harvest surfaces it identically. Never throws.
 */
export function awardAchievement(state: GameState, id: string, seat: PlayerId | undefined | null): void {
  try {
    if (!BY_ID[id] || seat === undefined || seat === null) return
    const f = ((state as any).flow ??= {})
    const list: AchvUnlock[] = (f.achievements ??= [])
    if (list.some((u) => u.id === id && u.seat === seat)) return
    list.push({ id, seat, turn: state.turn })
  } catch { /* cosmetic */ }
}
