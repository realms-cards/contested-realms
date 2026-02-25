import type { TutorialLesson } from "../types";

/**
 * Lesson 4: Elemental Thresholds
 * Teaches: Elemental affinity from sites, threshold requirements on spells,
 * multi-element thresholds, difference between mana (spent) and threshold (not spent).
 */
const lesson: TutorialLesson = {
  id: "lesson-04-thresholds",
  title: "Elemental Thresholds",
  description:
    "Learn how elemental affinity from your sites determines which spells you can cast.",
  order: 4,
  concepts: ["mana_thresholds", "elements"],
  initialState: {
    p1: {
      avatar: {
        cardId: 1,
        name: "Geomancer",
        type: "Avatar",
        attack: 1,
        defence: 1,
        slug: "bet-geomancer-b-s",
      },
      life: 20,
      mana: 3,
      thresholds: { earth: 3 },
      hand: [
        { cardId: 101, name: "Amazon Warriors", type: "Minion", cost: 5, attack: 5, defence: 5, thresholds: { earth: 1 }, slug: "bet-amazon_warriors-b-s" },
        { cardId: 102, name: "Cave Trolls", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { earth: 1 }, slug: "bet-cave_trolls-b-s" },
        { cardId: 104, name: "Mountain Giant", type: "Minion", cost: 8, attack: 8, defence: 8, thresholds: { earth: 4 }, slug: "alp-mountain_giant-b-s" },
        { cardId: 103, name: "Overpower", type: "Magic", cost: 1, thresholds: { earth: 1 }, slug: "bet-overpower-b-s", text: "Target unit gets +2/+2 until end of turn." },
      ],
      spellbook: [],
      atlas: [
        { cardId: 206, name: "Steppe", type: "Site", thresholds: { earth: 1, fire: 1 }, slug: "bet-steppe-b-s" },
      ],
    },
    p2: {
      avatar: {
        cardId: 2,
        name: "Flamecaller",
        type: "Avatar",
        attack: 1,
        defence: 1,
        slug: "bet-flamecaller-b-s",
      },
      life: 20,
      hand: [],
      spellbook: [],
      atlas: [],
    },
    board: {
      sites: {
        18: { owner: 1, card: { cardId: 204, name: "Valley", type: "Site", thresholds: { earth: 1 }, slug: "got-valley-pd-s" } },
        17: { owner: 1, card: { cardId: 202, name: "Holy Ground", type: "Site", thresholds: { earth: 1 }, slug: "bet-holy_ground-b-s" } },
        13: { owner: 1, card: { cardId: 203, name: "Humble Village", type: "Site", thresholds: { earth: 1 }, slug: "bet-humble_village-b-s" } },
      },
    },
    phase: "Main",
    currentPlayer: "p1",
    turn: 3,
  },
  steps: [
    {
      id: "thresh-intro",
      type: "narration",
      title: "Elemental Thresholds",
      text: "Besides mana, most spells require **elemental threshold** — a minimum number of matching elemental symbols on your sites. Let's explore how this works.",
    },
    {
      id: "thresh-affinity",
      type: "highlight",
      title: "Your Elemental Affinity",
      text: "You control three {earth} Earth sites: Valley, Holy Ground, and Humble Village. Each provides one {earth} Earth symbol. Your total {earth} Earth affinity is **3**.\n\nThis affinity determines which spells you can cast.",
      highlightTarget: { type: "tiles", tiles: [18, 17, 13] },
    },
    {
      id: "thresh-not-spent",
      type: "narration",
      title: "Threshold ≠ Mana",
      text: "A critical difference:\n\n- **Mana is spent** when you cast a spell (you lose it from your pool)\n- **Threshold is NOT spent** — it's a minimum requirement that stays available\n\nWith 3 {earth} Earth affinity, you can cast multiple spells that each require {earth} Earth threshold, as long as you have enough mana for each one.",
    },
    {
      id: "thresh-example-affordable",
      type: "narration",
      title: "Cave Trolls — Affordable!",
      text: "The **Cave Trolls** cost {mana:3} mana and require 1 {earth} Earth threshold. You have {mana:3} mana and 3 {earth} Earth affinity — exactly enough! You could cast this spell.",
      showCard: { name: "Cave Trolls", slug: "bet-cave_trolls-b-s", type: "Minion" },
    },
    {
      id: "thresh-example-mana-short",
      type: "narration",
      title: "Amazon Warriors — Not Enough Mana",
      text: "The **Amazon Warriors** cost {mana:5} mana and require 1 {earth} Earth threshold. You have enough {earth} Earth affinity (3 ≥ 1), but only {mana:3} mana — not enough to pay the {mana:5} mana cost. You'll need more sites first.",
      showCard: { name: "Amazon Warriors", slug: "bet-amazon_warriors-b-s", type: "Minion" },
    },
    {
      id: "thresh-example-cant",
      type: "narration",
      title: "Mountain Giant — Out of Reach",
      text: "The **Mountain Giant** costs {mana:8} mana and requires 4 {earth} Earth threshold. You don't have enough mana (only {mana:3}) OR enough {earth} Earth affinity (only 3, need 4). This mighty creature demands a much larger domain!",
      showCard: { name: "Mountain Giant", slug: "alp-mountain_giant-b-s", type: "Minion" },
    },
    {
      id: "thresh-multi-element",
      type: "narration",
      title: "Multi-Element Spells",
      text: "Some powerful spells require affinity with **multiple elements**. For example, a spell might need 1 {air} Air AND 2 {water} Water threshold. You'd need sites providing at least those symbols.\n\nCards with multiple element thresholds count as spells of EACH of those elements.",
    },
    {
      id: "thresh-artifacts",
      type: "narration",
      title: "Artifacts: No Threshold",
      text: "Unlike other spells, most **Artifacts** have no elemental threshold requirement — you only need to pay their mana cost. This makes artifacts versatile tools that any deck can use.",
      showCard: { name: "Torshammar Trinket", slug: "bet-torshammar_trinket-b-s", type: "Artifact" },
    },
    {
      id: "thresh-cast-trolls",
      type: "forced_action",
      title: "Cast Cave Trolls",
      text: "Let's put this into practice! Cast the **Cave Trolls** (cost: {mana:3} mana, threshold: 1 {earth} Earth) onto the Valley.",
      requiredAction: {
        type: "cast_spell",
        cardName: "Cave Trolls",
        tile: 18,
      },
      highlightTarget: { type: "tile", tile: 18 },
      hintText: "Select the Cave Trolls from your hand and place them on tile 18 (Valley).",
      showHint: true,
      statePatches: [
        { op: "remove_card_from_zone", player: "p1", zone: "hand", cardName: "Cave Trolls" },
        { op: "set_mana", player: "p1", value: 0 },
      ],
    },
    {
      id: "thresh-cast-success",
      type: "narration",
      title: "Spell Cast!",
      text: "The Cave Trolls have been summoned! You spent all {mana:3} of your mana, leaving {mana:0} remaining. Your {earth} Earth affinity is still 3 — threshold doesn't decrease when you cast spells.\n\nNote: newly summoned units have **Summoning Sickness** and can't tap for abilities this turn, but they CAN defend on your opponent's turn.",
    },
    {
      id: "thresh-complete",
      type: "checkpoint",
      title: "Thresholds Understood!",
      text: "You now understand the dual resource system: mana (spent) and elemental threshold (minimum requirement). Next, let's summon more minions and learn about their abilities!",
    },
  ],
};

export default lesson;
