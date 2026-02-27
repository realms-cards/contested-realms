import type { TutorialLesson } from "../types";

/**
 * Lesson 6: Movement & Combat
 * Teaches: Move and Attack ability, movement rules (adjacency, tapping),
 * attacking enemy units, simultaneous combat, damage resolution.
 *
 * Note: Movement and combat are demonstrated via scripted narration steps
 * with statePatches, since the tutorial doesn't support interactive
 * permanent dragging or combat mechanics.
 */
const lesson: TutorialLesson = {
  id: "lesson-06-movement",
  title: "Movement & Combat",
  description:
    "Learn to move your units across the realm and attack the enemy in combat.",
  order: 6,
  concepts: ["movement", "combat"],
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
      mana: 5,
      thresholds: { earth: 5 },
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
    board: {
      sites: {
        18: {
          owner: 1,
          card: {
            cardId: 204,
            name: "Valley",
            type: "Site",
            thresholds: { earth: 1 },
            slug: "got-valley-pd-s",
          },
        },
        17: {
          owner: 1,
          card: {
            cardId: 202,
            name: "Holy Ground",
            type: "Site",
            thresholds: { earth: 1 },
            slug: "bet-holy_ground-b-s",
          },
        },
        13: {
          owner: 1,
          card: {
            cardId: 203,
            name: "Humble Village",
            type: "Site",
            thresholds: { earth: 1 },
            slug: "bet-humble_village-b-s",
          },
        },
        19: {
          owner: 1,
          card: {
            cardId: 206,
            name: "Steppe",
            type: "Site",
            thresholds: { earth: 1, fire: 1 },
            slug: "bet-steppe-b-s",
          },
        },
        14: {
          owner: 1,
          card: {
            cardId: 205,
            name: "Vantage Hills",
            type: "Site",
            thresholds: { earth: 1 },
            slug: "bet-vantage_hills-b-s",
          },
        },
        3: {
          owner: 2,
          card: {
            cardId: 401,
            name: "Red Desert",
            type: "Site",
            thresholds: { fire: 1 },
            slug: "bet-red_desert-b-s",
          },
        },
        2: {
          owner: 2,
          card: {
            cardId: 402,
            name: "Arid Desert",
            type: "Site",
            thresholds: { fire: 1 },
            slug: "bet-arid_desert-b-s",
          },
        },
        4: {
          owner: 2,
          card: {
            cardId: 403,
            name: "Remote Desert",
            type: "Site",
            thresholds: { fire: 1 },
            slug: "bet-remote_desert-b-s",
          },
        },
        7: {
          owner: 2,
          card: {
            cardId: 404,
            name: "Scorched Earth",
            type: "Site",
            thresholds: { fire: 1 },
            slug: "bet-red_desert-b-s",
          },
        },
        8: {
          owner: 2,
          card: {
            cardId: 405,
            name: "Red Desert",
            type: "Site",
            thresholds: { fire: 1 },
            slug: "bet-red_desert-b-s",
          },
        }, // second copy of Red Desert
      },
    },
    permanents: [
      {
        owner: "p1",
        tile: 13,
        card: {
          cardId: 101,
          name: "Amazon Warriors",
          type: "Minion",
          cost: 5,
          attack: 5,
          defence: 5,
          thresholds: { earth: 1 },
          slug: "bet-amazon_warriors-b-s",
        },
      },
      {
        owner: "p1",
        tile: 19,
        card: {
          cardId: 106,
          name: "Scent Hounds",
          type: "Minion",
          cost: 2,
          attack: 2,
          defence: 2,
          thresholds: { earth: 1 },
          slug: "bet-scent_hounds-b-s",
        },
      },
      {
        owner: "p2",
        tile: 8,
        card: {
          cardId: 301,
          name: "Rimland Nomads",
          type: "Minion",
          cost: 2,
          attack: 2,
          defence: 2,
          thresholds: { fire: 1 },
          slug: "bet-rimland_nomads-b-s",
        },
      },
    ],
    phase: "Main",
    currentPlayer: "p1",
    turn: 6,
  },
  steps: [
    {
      id: "move-intro",
      type: "narration",
      title: "Move and Attack",
      text: "Every unit has a basic ability called **Move and Attack**. When activated, a unit can:\n\n1. **Optionally move** one step to an adjacent site\n2. **Optionally attack** something at its current location\n\nBoth parts are optional — you can move without attacking, attack without moving, or do both! Using this ability **taps** the unit (turns it sideways), meaning it can't act again until your next turn.",
    },
    {
      id: "move-rules",
      type: "narration",
      title: "Movement Rules",
      text: "Units move **one step** at a time — from one site to an adjacent site (up, down, left, or right). Some abilities grant **Movement +X** for extra steps.\n\nYou can only move to sites that exist — not into the Void! Movement is always **orthogonal** unless the unit has Airborne.",
    },
    {
      id: "move-battlefield",
      type: "highlight",
      title: "The Battlefield",
      text: "Your **Amazon Warriors** (power 5) are standing on Humble Village, and the enemy **Rimland Nomads** (power 2) are just one step ahead on the Red Desert.\n\nThe Warriors are ready to advance and engage!",
      highlightTarget: { type: "tiles", tiles: [13, 8] },
    },
    {
      id: "move-advance",
      type: "narration",
      title: "Amazon Warriors Advance!",
      text: "Watch as the **Amazon Warriors** move one step forward — from Humble Village to the Red Desert to confront the Rimland Nomads.\n\nThis uses their **Move and Attack** ability, which **taps** them (turns them sideways).",
      highlightTarget: { type: "tile", tile: 8 },
      statePatches: [
        { op: "remove_permanent", tile: 13, cardName: "Amazon Warriors" },
        {
          op: "place_permanent",
          permanent: {
            owner: "p1",
            tile: 8,
            card: {
              cardId: 101,
              name: "Amazon Warriors",
              type: "Minion",
              cost: 5,
              attack: 5,
              defence: 5,
              thresholds: { earth: 1 },
              slug: "bet-amazon_warriors-b-s",
            },
            tapped: true,
          },
        },
      ],
    },
    {
      id: "move-encounter",
      type: "narration",
      title: "Battle at the Red Desert!",
      text: "The Amazon Warriors arrive at the Red Desert — and the **Rimland Nomads** are here! When you attack an enemy unit at your location, both units **fight simultaneously** — they strike each other at the same time.\n\n- **Amazon Warriors** strike for **5 damage** (their power)\n- **Rimland Nomads** strike for **2 damage** (their power)",
      statePatches: [
        { op: "remove_permanent", tile: 8, cardName: "Rimland Nomads" },
      ],
    },
    {
      id: "move-resolution",
      type: "narration",
      title: "Damage Resolution",
      text: "The Rimland Nomads take 5 damage — their power is only 2, so they're **destroyed** and sent to the cemetery.\n\nThe Amazon Warriors take 2 damage — they have power 5, so they survive! Damage on units is **removed at end of turn**, so the Warriors will fully heal.",
    },
    {
      id: "move-tapped",
      type: "narration",
      title: "Tapped After Action",
      text: "The Amazon Warriors are now **tapped** (shown turned sideways). A tapped unit can't use any abilities until it **untaps** at the start of your next turn.\n\n",
    },
    {
      id: "move-attack-sites",
      type: "narration",
      title: "Attacking Sites",
      text: "You can also attack an **enemy site** instead of a unit. When you strike an undefended enemy site, the damage causes the controlling Avatar to **lose that much life**.\n\nImportant: Attacking a site causes *life loss*, not direct damage — so it can't deliver a Death Blow. Be vigilant, as even an empty site can be defended by an untapped minion that is in range.",
    },
    {
      id: "move-complete",
      type: "checkpoint",
      title: "Combat Learned!",
      text: "You now understand movement and combat! Your units can advance across the realm, fight enemies, and strike at undefended sites. Next, we'll learn about defending and intercepting — abilities you can use on your opponent's turn.",
    },
  ],
};

export default lesson;
