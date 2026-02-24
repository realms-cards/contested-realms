import type { TutorialLesson } from "../types";

/**
 * Lesson 2: Setup & Drawing
 * Teaches: Avatar placement, decks, drawing starting hand, turn structure basics.
 */
const lesson: TutorialLesson = {
  id: "lesson-02-setup",
  title: "Setting Up the Game",
  description:
    "Learn how to set up a game — placing your Avatar, drawing your starting hand, and the turn structure.",
  order: 2,
  concepts: ["setup", "turn_sequence"],
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
      spellbook: [
        { cardId: 101, name: "Amazon Warriors", type: "Minion", cost: 5, attack: 5, defence: 5, thresholds: { earth: 1 }, slug: "bet-amazon_warriors-b-s" },
        { cardId: 102, name: "Cave Trolls", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { earth: 1 }, slug: "bet-cave_trolls-b-s" },
        { cardId: 103, name: "Overpower", type: "Magic", cost: 1, thresholds: { earth: 1 }, slug: "bet-overpower-b-s", text: "Target unit gets +2/+2 until end of turn." },
      ],
      atlas: [
        { cardId: 204, name: "Valley", type: "Site", thresholds: { earth: 1 }, slug: "got-valley-pd-s" },
        { cardId: 202, name: "Holy Ground", type: "Site", thresholds: { earth: 1 }, slug: "bet-holy_ground-b-s" },
        { cardId: 203, name: "Humble Village", type: "Site", thresholds: { earth: 1 }, slug: "bet-humble_village-b-s" },
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
      spellbook: [
        { cardId: 301, name: "Rimland Nomads", type: "Minion", cost: 2, attack: 2, defence: 2, thresholds: { fire: 1 }, slug: "bet-rimland_nomads-b-s" },
      ],
      atlas: [
        { cardId: 401, name: "Red Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-red_desert-b-s" },
      ],
    },
    phase: "Setup",
    currentPlayer: "p1",
    turn: 0,
  },
  steps: [
    {
      id: "setup-intro",
      type: "narration",
      title: "Game Setup",
      text: "Before the game begins, both players set up their positions. Let's walk through the setup process.",
    },
    {
      id: "setup-avatar-placement",
      type: "highlight",
      title: "Avatar Placement",
      text: "Each Avatar is placed in the middle square of their bottom row. Your Geomancer is already in position. The opponent's Flamecaller is on the opposite side.",
      highlightTarget: { type: "avatar", player: "p1" },
      revealHud: ["lifeCounters"],
    },
    {
      id: "setup-decks",
      type: "narration",
      title: "Your Decks",
      text: "Each player has two decks:\n\n- **Atlas** (at least 30 cards) — Site cards that expand your domain\n- **Spellbook** (at least 50 cards) — Spells including minions, artifacts, auras, and magics\n\nBoth decks are shuffled before the game begins.",
      revealHud: ["piles"],
    },
    {
      id: "setup-draw-hand",
      type: "narration",
      title: "Drawing Your Starting Hand",
      text: "Each player draws **3 cards from their Atlas** and **3 cards from their Spellbook** to form their starting hand of 6 cards.\n\nIf you're not happy with your hand, you may take one **Mulligan** — return up to 3 cards to the bottom of their decks and redraw the same number.",
    },
    {
      id: "setup-draw-simulate",
      type: "narration",
      title: "Your Starting Hand",
      text: "Let's draw your starting hand! You draw 3 Atlas cards (sites) and 3 Spellbook cards (spells).",
      revealHud: ["hand"],
      statePatches: [
        { op: "add_card_to_zone", player: "p1", zone: "hand", card: { cardId: 204, name: "Valley", type: "Site", thresholds: { earth: 1 }, slug: "got-valley-pd-s" } },
        { op: "add_card_to_zone", player: "p1", zone: "hand", card: { cardId: 202, name: "Holy Ground", type: "Site", thresholds: { earth: 1 }, slug: "bet-holy_ground-b-s" } },
        { op: "add_card_to_zone", player: "p1", zone: "hand", card: { cardId: 203, name: "Humble Village", type: "Site", thresholds: { earth: 1 }, slug: "bet-humble_village-b-s" } },
        { op: "add_card_to_zone", player: "p1", zone: "hand", card: { cardId: 101, name: "Amazon Warriors", type: "Minion", cost: 5, attack: 5, defence: 5, thresholds: { earth: 1 }, slug: "bet-amazon_warriors-b-s" } },
        { op: "add_card_to_zone", player: "p1", zone: "hand", card: { cardId: 102, name: "Cave Trolls", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { earth: 1 }, slug: "bet-cave_trolls-b-s" } },
        { op: "add_card_to_zone", player: "p1", zone: "hand", card: { cardId: 103, name: "Overpower", type: "Magic", cost: 1, thresholds: { earth: 1 }, slug: "bet-overpower-b-s", text: "Target unit gets +2/+2 until end of turn." } },
      ],
    },
    {
      id: "setup-hand-explain",
      type: "highlight",
      title: "Your Hand",
      text: "Here's your hand! You have 3 sites (Valley, Holy Ground, Humble Village) and 3 spells (Amazon Warriors, Cave Trolls, Overpower). Sites go into the Realm to build your domain; spells are cast to influence the battle.",
      highlightTarget: { type: "zone", zone: "hand" },
    },
    {
      id: "setup-turns",
      type: "narration",
      title: "Turn Structure",
      text: "Each turn has three phases:\n\n1. **Start Phase** — Untap your cards, gain mana from sites, draw a card\n2. **Main Phase** — Cast spells, move units, attack the enemy\n3. **End Phase** — Heal minion damage, end your turn\n\nThe first player skips their initial card draw.",
    },
    {
      id: "setup-first-turn",
      type: "narration",
      title: "Your First Turn",
      text: "On your very first turn, you must establish your domain by playing a site to your Avatar's square. This is essential — without sites, you have no mana to cast spells!\n\nLet's learn how to do that in the next lesson.",
    },
    {
      id: "setup-complete",
      type: "checkpoint",
      title: "Setup Complete!",
      text: "You now understand how a game is set up. Next, we'll learn about playing sites and using mana.",
    },
  ],
};

export default lesson;
