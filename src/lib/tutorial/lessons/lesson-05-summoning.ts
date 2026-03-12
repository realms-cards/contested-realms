import type { TutorialLesson } from "../types";

/**
 * Lesson 5: Casting Minions
 * Teaches: Casting minion spells, summoning sickness, card types overview,
 * spellcasters, placing minions on your sites.
 *
 * Rules distinction (SorceryRulebook.txt §CASTING MINIONS):
 *  - "Casting" = playing a spell from hand (pay mana + meet threshold)
 *  - Casting a minion spell → the minion enters play on any of your sites
 *  - "Summon" (keyword) = put directly into play WITHOUT casting (no mana cost)
 *  - "Summoning Sickness" = the state any newly-entered minion is in
 */
const lesson: TutorialLesson = {
  id: "lesson-05-summoning",
  title: "Casting Minions",
  description:
    "Learn to cast minion spells to build your army, and understand summoning sickness.",
  order: 5,
  concepts: ["summoning_minions", "casting_spells"],
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
      hand: [
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
          cardId: 105,
          name: "Belmotte Longbowmen",
          type: "Minion",
          cost: 3,
          attack: 3,
          defence: 3,
          thresholds: { earth: 1 },
          slug: "alp-belmotte_longbowmen-b-s",
          text: "Ranged",
        },
        {
          cardId: 106,
          name: "Scent Hounds",
          type: "Minion",
          cost: 2,
          attack: 2,
          defence: 2,
          thresholds: { earth: 1 },
          slug: "bet-scent_hounds-b-s",
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
            cardId: 405,
            name: "Dwarven Forge",
            type: "Site",
            thresholds: { fire: 1 },
            slug: "alp-dwarven_forge-b-s",
          },
        },
      },
    },
    phase: "Main",
    currentPlayer: "p1",
    turn: 5,
  },
  steps: [
    {
      id: "cast-intro",
      type: "narration",
      title: "Casting Minions",
      text: "Minions are your greatest allies — they attack, defend, and some have special abilities. To play a minion into the realm, you **cast** it like any other spell: pay the mana cost while meeting the elemental threshold, and place it on one of your sites.",
    },
    {
      id: "cast-spellcaster",
      type: "narration",
      title: "Spellcasters",
      text: "To cast any spell, you need a **Spellcaster** — a unit that can cast spells. Your Avatar is always a Spellcaster! Some minions are also Spellcasters.\n\nThe Spellcaster's **location** can determine where a spell takes effect. When you cast a minion spell, the minion enters the realm atop any site you control.",
    },
    {
      id: "cast-card-anatomy",
      type: "narration",
      title: "Reading a Minion Card",
      text: "Look at the **Belmotte Longbowmen**:\n- **Mana cost**: {mana:3} (upper left)\n- **Threshold**: 1 {earth} Earth\n- **Power**: 3 — used for both attacking AND determining how much damage kills them\n- **Ability**: Ranged — they can attack from a distance!\n\nA minion dies when it takes damage equal to or greater than its power.",
      showCard: {
        name: "Belmotte Longbowmen",
        slug: "alp-belmotte_longbowmen-b-s",
        type: "Minion",
      },
    },
    {
      id: "cast-place-longbowmen",
      type: "forced_action",
      title: "Cast Belmotte Longbowmen",
      text: "Cast the **Belmotte Longbowmen** onto the Humble Village. They cost {mana:3} mana — you have {mana:5} available.",
      requiredAction: {
        type: "cast_spell",
        cardName: "Belmotte Longbowmen",
        tile: 13,
      },
      highlightTarget: { type: "tile", tile: 13 },
      hintText:
        "Select Belmotte Longbowmen from your hand and place them on tile 13 (Humble Village, just above your Avatar).",
      showHint: true,
      statePatches: [
        {
          op: "remove_card_from_zone",
          player: "p1",
          zone: "hand",
          cardName: "Belmotte Longbowmen",
        },
        { op: "set_mana", player: "p1", value: 2 },
      ],
    },
    {
      id: "cast-sickness",
      type: "narration",
      title: "Summoning Sickness",
      text: "The Belmotte Longbowmen are in play! But notice — they have **Summoning Sickness** this turn. Any minion that enters the realm this turn, whether from being cast or from another effect:\n\n- **Cannot tap** or be tapped for ability costs (including Move and Attack)\n- **CAN** still defend or intercept on your opponent's turn\n- Summoning sickness ends when they untap at the start of your next turn",
    },
    {
      id: "cast-multiple",
      type: "narration",
      title: "Multiple Minions Per Site",
      text: "There's no limit to the number of minions occupying the same site. However, concentrating your forces on one square is risky — it's usually better to spread out.",
    },
    {
      id: "cast-spend-remaining",
      type: "narration",
      title: "Spend Your Mana Wisely",
      text: "You still have {mana:2} mana left this turn. You could cast the **Scent Hounds** (cost: {mana:2}) to get another unit on the board. Remember — unspent mana is lost at end of turn!\n\nIf possible deploy a stategy that uses most of your mana each turn for maximum efficiency.",
    },
    {
      id: "cast-place-hounds",
      type: "forced_action",
      title: "Cast Scent Hounds",
      text: "Cast the **Scent Hounds** onto the Steppe for {mana:2} mana.",
      requiredAction: {
        type: "cast_spell",
        cardName: "Scent Hounds",
        tile: 19,
      },
      highlightTarget: { type: "tile", tile: 19 },
      hintText:
        "Select Scent Hounds from your hand and place them on tile 19 (Steppe).",
      showHint: true,
      statePatches: [
        {
          op: "remove_card_from_zone",
          player: "p1",
          zone: "hand",
          cardName: "Scent Hounds",
        },
        { op: "set_mana", player: "p1", value: 0 },
      ],
    },
    {
      id: "cast-other-spells",
      type: "narration",
      title: "Other Spell Types",
      text: "Besides minions, there are three other spell types:\n\n- **Artifacts** — Lasting objects conjured onto a site or into a unit's hands\n- **Auras** — Lasting area effects conjured at square intersections\n- **Magics** — One-shot spells that resolve immediately and then go directly to the cemetery\n\nEach has unique placement rules that you'll discover as you play.",
    },
    {
      id: "cast-summon-keyword",
      type: "narration",
      title: "Casting vs Summoning",
      text: 'One important distinction: **casting** a minion spell means paying its mana cost and meeting its threshold — this is the normal way to get minions into play.\n\nSome cards have the keyword **Summon**, which means putting a card directly into play **without casting** — no mana cost needed! If you see "Summon" on a card effect, that\'s a powerful shortcut.',
    },
    {
      id: "cast-complete",
      type: "checkpoint",
      title: "Casting Mastered!",
      text: "You can now cast minion spells to build your army. Remember: casting costs mana, but the Summon keyword bypasses that entirely. Some cards can also **Transform**, which banishes the original and replaces it with a new card — keeping its game state like being untapped! Next, we'll learn how to move your minions and attack the enemy!",
    },
  ],
};

export default lesson;
