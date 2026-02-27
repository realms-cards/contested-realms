import type { TutorialLesson } from "../types";

/**
 * Lesson 3: Playing Sites & Mana
 * Teaches: Tap avatar ability, placing sites, mana generation, spending mana.
 */
const lesson: TutorialLesson = {
  id: "lesson-03-sites-mana",
  title: "Sites & Mana",
  description:
    "Learn to play sites to expand your domain and generate mana — the resource that powers your spells.",
  order: 3,
  concepts: ["playing_sites", "mana_thresholds"],
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
      mana: 0,
      thresholds: { earth: 0 },
      hand: [
        {
          cardId: 204,
          name: "Valley",
          type: "Site",
          thresholds: { earth: 1 },
          slug: "got-valley-pd-s",
        },
        {
          cardId: 202,
          name: "Holy Ground",
          type: "Site",
          thresholds: { earth: 1 },
          slug: "bet-holy_ground-b-s",
        },
        {
          cardId: 203,
          name: "Humble Village",
          type: "Site",
          thresholds: { earth: 1 },
          slug: "bet-humble_village-b-s",
        },
        {
          cardId: 101,
          name: "Amazon Warriors",
          type: "Minion",
          cost: 5,
          attack: 5,
          defence: 5,
          thresholds: { earth: 1 },
          slug: "bet-amazon_warriors-b-s",
        },
        {
          cardId: 102,
          name: "Cave Trolls",
          type: "Minion",
          cost: 3,
          attack: 3,
          defence: 3,
          thresholds: { earth: 1 },
          slug: "bet-cave_trolls-b-s",
        },
        {
          cardId: 103,
          name: "Overpower",
          type: "Magic",
          cost: 1,
          thresholds: { earth: 1 },
          slug: "bet-overpower-b-s",
          text: "Target unit gets +2/+2 until end of turn.",
        },
      ],
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
    phase: "Main",
    currentPlayer: "p1",
    turn: 1,
  },
  steps: [
    {
      id: "mana-intro",
      type: "narration",
      title: "Sites & Mana",
      text: "Sites are the backbone of your strategy. They provide **mana** — the resource you spend to cast spells — and **elemental affinity** — which determines which spells you can cast. Let's learn how to play them.",
    },
    {
      id: "mana-tap-avatar",
      type: "narration",
      title: "Tap Your Avatar",
      text: 'Your Avatar has this ability: **"Tap → Play or draw a site."**\n\nTo use it, you tap your Avatar (turn it 90°), which lets you play a site from your hand onto the board, or draw one from your Atlas.\n\n*Note: In paper play you must tap your Avatar yourself. On realms.cards the simulator taps it automatically when you play a site. To tap/untap manually press `t` on the keyboard*',
      showHint: true,
    },
    {
      id: "mana-first-site-explain",
      type: "narration",
      title: "Your First Site",
      text: "On your first turn, you MUST play a site to your Avatar's position. This establishes your domain.\n\nAfter that, sites must be placed on **Void** (empty squares) that are **adjacent** to a site you already control — adjacent means sharing a border (not diagonal).",
    },
    {
      id: "mana-play-site",
      type: "forced_action",
      title: "Play Valley",
      text: "Let's play your first site! Drag the **Valley** from your hand onto your Avatar's square (center of your bottom row).",
      requiredAction: {
        type: "play_site",
        cardName: "Valley",
        tile: 18,
      },
      highlightTarget: { type: "tile", tile: 18 },
      hintText:
        "Drag the Valley from your hand onto tile 18 (center of your bottom row, where your Avatar stands).",
      showHint: true,
      statePatches: [
        {
          op: "remove_card_from_zone",
          player: "p1",
          zone: "hand",
          cardName: "Valley",
        },
        {
          op: "place_site",
          tile: 18,
          site: {
            owner: 1,
            card: {
              cardId: 204,
              name: "Valley",
              type: "Site",
              thresholds: { earth: 1 },
              slug: "got-valley-pd-s",
            },
          },
        },
        { op: "set_mana", player: "p1", value: 1 },
        { op: "set_thresholds", player: "p1", value: { earth: 1 } },
      ],
    },
    {
      id: "mana-site-placed",
      type: "narration",
      title: "Site Placed!",
      text: "Excellent! The Valley is now in the realm. Notice two things:\n\n1. **Mana**: The site immediately provides {mana:1} mana for this turn\n2. **Elemental Affinity**: The {earth} Earth symbol on the site gives you 1 {earth} Earth affinity",
      revealHud: ["resourcePanels"],
    },
    {
      id: "mana-explain-mana",
      type: "narration",
      title: "Understanding Mana",
      text: "You now have {mana:1} **mana** available. At the start of each of your turns, ALL your sites provide {mana:1} mana each. Mana is spent to cast spells. Any unspent mana is lost at the end of your turn — so use it wisely!",
    },
    {
      id: "mana-cant-afford",
      type: "narration",
      title: "Not Enough Mana",
      text: "Look at your hand — the Amazon Warriors cost {mana:5} mana, and Cave Trolls cost {mana:3}. With only {mana:1} mana from one site, you can't afford either yet.\n\nNext turn, you'll play another site to grow your mana pool. Over a few turns, you'll have enough to summon powerful creatures!",
    },
    {
      id: "mana-adjacency",
      type: "narration",
      title: "Site Placement Rules",
      text: "Remember: after your first site, new sites must be placed on **Void** (empty squares) **adjacent** to a site you control.\n\nAdjacent means sharing a border — up, down, left, or right. **Not diagonal.**\n\nThis means you expand your domain one square at a time, strategically choosing where to grow.",
    },
    {
      id: "mana-complete",
      type: "checkpoint",
      title: "Mana Mastered!",
      text: "You now understand sites and mana — the engine that powers your magic. Next, we'll learn about elemental thresholds and casting spells.",
    },
  ],
};

export default lesson;
