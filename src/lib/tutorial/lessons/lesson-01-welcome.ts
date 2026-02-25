import type { TutorialLesson } from "../types";

/**
 * Lesson 1: Welcome & Board Overview
 * Teaches: What is Sorcery, the realm (5x4 grid), avatars, game zones, win condition.
 */
const lesson: TutorialLesson = {
  id: "lesson-01-welcome",
  title: "Welcome to the Realm",
  description:
    "Learn the basics of Sorcery: Contested Realm — the board, your avatar, and how to win.",
  order: 1,
  concepts: ["introduction", "game_zones", "card_types"],
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
      hand: [],
      spellbook: [],
      atlas: [],
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
    phase: "Setup",
    currentPlayer: "p1",
    turn: 0,
  },
  steps: [
    {
      id: "welcome-intro",
      type: "narration",
      title: "Welcome, Avatar!",
      text: "In Sorcery: Contested Realm, you take on the role of a powerful Avatar battling for control of a fantastical realm. You'll summon minions, cast spells, and wield the four elements — {air} Air, {earth} Earth, {fire} Fire, and {water} Water — to vanquish your opponent.",
    },
    {
      id: "welcome-board",
      type: "highlight",
      title: "The Realm",
      text: "This is the Realm — a 5x4 grid of squares where battle takes place. Each square starts as part of the Void. You'll fill these squares with Sites to build your domain.",
      highlightTarget: { type: "board" },
    },
    {
      id: "welcome-avatar",
      type: "highlight",
      title: "Your Avatar",
      text: "This is your Avatar — the Geomancer. Your Avatar represents you in the realm. It has attack power (1) and defence (1). Everything you do flows through your Avatar.",
      highlightTarget: { type: "avatar", player: "p1" },
    },
    {
      id: "welcome-life",
      type: "highlight",
      title: "Life Total",
      text: "Each player starts with **20 life**. You can heal, but your life can never exceed 20. When your life reaches **0**, you're at Death's Door — and you cannot heal back from it. One more hit and it's over!",
      highlightTarget: { type: "ui", element: "life_counter" },
      revealHud: ["lifeCounters"],
    },
    {
      id: "welcome-opponent",
      type: "highlight",
      title: "The Enemy",
      text: "Your opponent's Avatar — the Flamecaller — sits across the realm. Your goal is to reduce their life to zero (placing them at Death's Door) and then deliver a final Death Blow.",
      highlightTarget: { type: "avatar", player: "p2" },
    },
    {
      id: "welcome-zones",
      type: "highlight",
      title: "Game Zones",
      text: "To the right of the Realm you'll find your card piles:\n\n- **Atlas** (top, landscape) — Your deck of site cards for the Realm\n- **Spellbook** (middle, portrait) — Your deck of spell cards (minions, magics, artifacts, auras)\n- **Cemetery** (bottom, empty) — Your discard pile for destroyed or used cards\n\nAt the start of each turn, you draw one card from your Spellbook and one from your Atlas.",
      highlightTarget: { type: "piles", player: "p1" },
      revealHud: ["piles"],
    },
    {
      id: "welcome-sites",
      type: "narration",
      title: "Sites",
      text: "**Sites** are terrain cards drawn from your Atlas. They fill the empty Void squares of the Realm. Each site provides two things:\n\n- {mana:1} **Mana** — the resource you spend to cast spells\n- **Elemental Affinity** — symbols that determine which spells you can cast\n\nFor example, **Valley** is an Ordinary {earth} Earth site. When placed, it gives you {mana:1} mana and 1 {earth} Earth affinity. Your first site must always be placed under your Avatar.",
      showCard: { name: "Valley", slug: "got-valley-pd-s", type: "Site" },
    },
    {
      id: "welcome-spell-types",
      type: "narration",
      title: "Spell Types",
      text: "**Spells** are cards drawn from your Spellbook. There are four types:\n\n- **Minions** — Creatures you summon onto sites to fight for you\n- **Magic** — One-shot spells that resolve immediately, then go to the cemetery\n- **Artifacts** — Lasting objects that can be carried by units\n- **Auras** — Lasting area effects placed at square intersections",
    },
    {
      id: "welcome-example-minion",
      type: "narration",
      title: "Example: Amazon Warriors",
      text: "The **Amazon Warriors** are a Minion spell:\n\n- **Mana Cost**: {mana:5} — you need {mana:5} mana to summon them\n- **Threshold**: 1 {earth} Earth — you need at least 1 {earth} Earth affinity from your sites\n- **Power**: 5/5 — they strike for 5 damage, and it takes 5 damage to kill them\n\nMinions stay on the board until destroyed. They can move, attack, and defend.",
      showCard: { name: "Amazon Warriors", slug: "bet-amazon_warriors-b-s", type: "Minion" },
    },
    {
      id: "welcome-example-magic",
      type: "narration",
      title: "Example: Overpower",
      text: "**Overpower** is a Magic spell:\n\n- **Mana Cost**: {mana:1} — very cheap to cast\n- **Threshold**: 1 {earth} Earth\n- **Effect**: \"Target unit gets +2/+2 until end of turn\"\n\nMagic spells resolve instantly and go to the cemetery. They're powerful tools for turning the tide of combat!",
      showCard: { name: "Overpower", slug: "bet-overpower-b-s", type: "Magic" },
    },
    {
      id: "welcome-elements",
      type: "narration",
      title: "The Four Elements",
      text: "The game is built around four classical elements:\n\n- {air} **Air** — Knowledge and mobility\n- {earth} **Earth** — Strength and endurance\n- {fire} **Fire** — Destruction and speed\n- {water} **Water** — Trickery and adaptation\n\nMost spells are tied to one or more elements.",
    },
    {
      id: "welcome-win",
      type: "narration",
      title: "How to Win",
      text: "To win, you must:\n1. Reduce your opponent's Avatar life to **0** (Death's Door)\n2. Then deal **any damage** to finish them (Death Blow)\n\nAlternatively, if a player tries to draw from an empty deck, they immediately lose!",
    },
    {
      id: "welcome-complete",
      type: "checkpoint",
      title: "Ready to Learn!",
      text: "Great! You now know the basics of what Sorcery is about. In the next lesson, we'll set up a game and start playing.",
    },
  ],
};

export default lesson;
