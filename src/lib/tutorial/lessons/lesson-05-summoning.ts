import type { TutorialLesson } from "../types";

/**
 * Lesson 5: Summoning Minions
 * Teaches: Casting minion spells, summoning sickness, card types overview,
 * spellcasters, placing minions on your sites.
 */
const lesson: TutorialLesson = {
  id: "lesson-05-summoning",
  title: "Summoning Minions",
  description:
    "Learn to summon minions to fight for you, and understand summoning sickness and spellcasters.",
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
        { cardId: 101, name: "Amazon Warriors", type: "Minion", cost: 5, attack: 5, defence: 5, thresholds: { earth: 1 }, slug: "bet-amazon_warriors-b-s" },
        { cardId: 105, name: "Belmotte Longbowmen", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { earth: 1 }, slug: "alp-belmotte_longbowmen-b-s", text: "Ranged" },
        { cardId: 106, name: "Scent Hounds", type: "Minion", cost: 2, attack: 2, defence: 2, thresholds: { earth: 1 }, slug: "bet-scent_hounds-b-s" },
        { cardId: 103, name: "Overpower", type: "Magic", cost: 1, thresholds: { earth: 1 }, slug: "bet-overpower-b-s", text: "Target unit gets +2/+2 until end of turn." },
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
        18: { owner: 1, card: { cardId: 204, name: "Valley", type: "Site", thresholds: { earth: 1 }, slug: "got-valley-pd-s" } },
        17: { owner: 1, card: { cardId: 202, name: "Holy Ground", type: "Site", thresholds: { earth: 1 }, slug: "bet-holy_ground-b-s" } },
        13: { owner: 1, card: { cardId: 203, name: "Humble Village", type: "Site", thresholds: { earth: 1 }, slug: "bet-humble_village-b-s" } },
        19: { owner: 1, card: { cardId: 206, name: "Steppe", type: "Site", thresholds: { earth: 1, fire: 1 }, slug: "bet-steppe-b-s" } },
        14: { owner: 1, card: { cardId: 205, name: "Vantage Hills", type: "Site", thresholds: { earth: 1 }, slug: "bet-vantage_hills-b-s" } },
        3: { owner: 2, card: { cardId: 401, name: "Red Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-red_desert-b-s" } },
        2: { owner: 2, card: { cardId: 402, name: "Arid Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-arid_desert-b-s" } },
        4: { owner: 2, card: { cardId: 403, name: "Remote Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-remote_desert-b-s" } },
        7: { owner: 2, card: { cardId: 404, name: "Scorched Earth", type: "Site", thresholds: { fire: 1 }, slug: "bet-red_desert-b-s" } },
      },
    },
    phase: "Main",
    currentPlayer: "p1",
    turn: 5,
  },
  steps: [
    {
      id: "summon-intro",
      type: "narration",
      title: "Summoning Minions",
      text: "Minions are your greatest allies — they attack, defend, and use special abilities. To summon a minion, you cast it like any spell: pay the mana cost, meet the elemental threshold, and place it on one of your sites.",
    },
    {
      id: "summon-spellcaster",
      type: "narration",
      title: "Spellcasters",
      text: "To cast any spell, you need a **Spellcaster** — a unit that can cast spells. Your Avatar is always a Spellcaster. Some minions can also be Spellcasters.\n\nThe Spellcaster's **location** determines where the spell takes effect. Minions are summoned atop any site you control.",
    },
    {
      id: "summon-card-anatomy",
      type: "narration",
      title: "Reading a Minion Card",
      text: "Look at the **Belmotte Longbowmen**:\n- **Mana cost**: {mana:3} (upper left)\n- **Threshold**: 1 {earth} Earth\n- **Power**: 3 — used for both attacking AND determining how much damage kills them\n- **Ability**: Ranged — they can attack from a distance!\n\nA minion dies when it takes damage equal to or greater than its power.",
      showCard: { name: "Belmotte Longbowmen", slug: "alp-belmotte_longbowmen-b-s", type: "Minion" },
    },
    {
      id: "summon-place-longbowmen",
      type: "forced_action",
      title: "Summon Belmotte Longbowmen",
      text: "Summon the **Belmotte Longbowmen** onto the Humble Village. They cost {mana:3} mana — you have {mana:5} available.",
      requiredAction: {
        type: "cast_spell",
        cardName: "Belmotte Longbowmen",
        tile: 13,
      },
      highlightTarget: { type: "tile", tile: 13 },
      hintText: "Select Belmotte Longbowmen from your hand and place them on tile 13 (Humble Village, just above your Avatar).",
      showHint: true,
      statePatches: [
        { op: "remove_card_from_zone", player: "p1", zone: "hand", cardName: "Belmotte Longbowmen" },
        { op: "set_mana", player: "p1", value: 2 },
      ],
    },
    {
      id: "summon-sickness",
      type: "narration",
      title: "Summoning Sickness",
      text: "The Belmotte Longbowmen are in play! But notice — they have **Summoning Sickness** this turn. That means:\n\n- They **cannot tap** for abilities (including Move and Attack)\n- They CAN still **defend** on your opponent's turn\n- Summoning sickness ends at the start of your next turn when they untap",
    },
    {
      id: "summon-multiple",
      type: "narration",
      title: "Multiple Minions Per Site",
      text: "There's no limit to how many minions can stand on the same site. However, concentrating all your forces on one square is risky — it's usually better to spread out.",
    },
    {
      id: "summon-spend-remaining",
      type: "narration",
      title: "Spend Your Mana Wisely",
      text: "You still have {mana:2} mana left this turn. You could summon the **Scent Hounds** (cost: {mana:2}) to get another unit on the board. Remember — unspent mana is lost at end of turn!\n\nGood players try to use all their mana each turn for maximum efficiency.",
    },
    {
      id: "summon-place-hounds",
      type: "forced_action",
      title: "Summon Scent Hounds",
      text: "Summon the **Scent Hounds** onto the Steppe for {mana:2} mana.",
      requiredAction: {
        type: "cast_spell",
        cardName: "Scent Hounds",
        tile: 19,
      },
      highlightTarget: { type: "tile", tile: 19 },
      hintText: "Select Scent Hounds from your hand and place them on tile 19 (Steppe).",
      showHint: true,
      statePatches: [
        { op: "remove_card_from_zone", player: "p1", zone: "hand", cardName: "Scent Hounds" },
        { op: "set_mana", player: "p1", value: 0 },
      ],
    },
    {
      id: "summon-other-spells",
      type: "narration",
      title: "Other Spell Types",
      text: "Besides minions, there are three other spell types:\n\n- **Artifacts** — Lasting objects that can be carried by units\n- **Auras** — Lasting area effects placed at square intersections\n- **Magics** — One-shot spells that resolve immediately and go to the cemetery\n\nEach has unique placement rules that you'll discover as you play.",
    },
    {
      id: "summon-complete",
      type: "checkpoint",
      title: "Summoning Mastered!",
      text: "You can now summon minions to build your army. Next, we'll learn how to move them and attack the enemy!",
    },
  ],
};

export default lesson;
