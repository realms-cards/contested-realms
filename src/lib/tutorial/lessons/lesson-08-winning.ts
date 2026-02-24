import type { TutorialLesson } from "../types";

/**
 * Lesson 8: Death's Door & Winning
 * Teaches: Reducing Avatar to 0 life, Death's Door immunity, Death Blow,
 * attacking sites for life loss, the complete win condition.
 */
const lesson: TutorialLesson = {
  id: "lesson-08-winning",
  title: "Death's Door & Victory",
  description:
    "Learn how to deliver the final blow and win the game!",
  order: 8,
  concepts: ["deaths_door", "win_condition"],
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
      life: 15,
      mana: 5,
      thresholds: { earth: 5 },
      hand: [
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
      life: 3,
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
        8: { owner: 2, card: { cardId: 401, name: "Red Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-red_desert-b-s" } },
        3: { owner: 2, card: { cardId: 402, name: "Arid Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-arid_desert-b-s" } },
        2: { owner: 2, card: { cardId: 403, name: "Remote Desert", type: "Site", thresholds: { fire: 1 }, slug: "bet-remote_desert-b-s" } },
      },
    },
    permanents: [
      { owner: "p1", tile: 8, card: { cardId: 101, name: "Amazon Warriors", type: "Minion", cost: 5, attack: 5, defence: 5, thresholds: { earth: 1 }, slug: "bet-amazon_warriors-b-s" } },
      { owner: "p1", tile: 13, card: { cardId: 102, name: "Cave Trolls", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { earth: 1 }, slug: "bet-cave_trolls-b-s" } },
    ],
    phase: "Main",
    currentPlayer: "p1",
    turn: 8,
  },
  steps: [
    {
      id: "win-intro",
      type: "narration",
      title: "The Final Push",
      text: "The battle has been raging and you're in a strong position. The enemy Flamecaller has only **3 life** remaining. It's time to learn how to finish the game!",
    },
    {
      id: "win-life-loss",
      type: "narration",
      title: "Attacking Sites for Life Loss",
      text: "Remember: when you attack an undefended enemy site, your unit strikes it and the controlling Avatar **loses that much life**.\n\nYour Amazon Warriors (power 5) are on the Red Desert — an enemy site. If they attack it, the Flamecaller loses 5 life.\n\nBut here's the key: this causes **life loss**, not direct damage. Let's see what happens.",
    },
    {
      id: "win-attack-site",
      type: "forced_action",
      title: "Attack the Red Desert",
      text: "Move and attack the **Red Desert** with your Amazon Warriors to reduce the Flamecaller's life!",
      requiredAction: {
        type: "attack",
        attackerName: "Amazon Warriors",
        targetName: "Red Desert",
        attackerTile: 8,
        targetTile: 8,
      },
      hintText: "Tap the Amazon Warriors and attack the Red Desert site on tile 8.",
      showHint: true,
      statePatches: [
        { op: "tap_permanent", tile: 8, cardName: "Amazon Warriors" },
        { op: "set_life", player: "p2", value: 0 },
      ],
    },
    {
      id: "win-deaths-door",
      type: "narration",
      title: "Death's Door!",
      text: "The Flamecaller's life drops to **0** — they are now at **Death's Door!**\n\nAt this moment:\n- The Avatar becomes **immune to damage** for the rest of this turn\n- The Avatar can **no longer gain life**\n\nThis brief window of immunity means you can't finish them off in the same action. You'll need another attack next turn — the **Death Blow**.",
    },
    {
      id: "win-immunity",
      type: "narration",
      title: "Turn Immunity",
      text: "Since the Flamecaller just hit Death's Door this turn, they're immune to damage until your next turn. Even if you have other units that could attack, the damage won't count.\n\nBut next turn, ANY damage to the Avatar at Death's Door is a **Death Blow** — and the game is over!",
    },
    {
      id: "win-end-turn",
      type: "forced_action",
      title: "End Your Turn",
      text: "End your turn. Next turn, you'll deliver the Death Blow!",
      requiredAction: { type: "end_turn" },
      hintText: "Click the End Turn button.",
      statePatches: [
        { op: "set_phase", value: "End" },
      ],
    },
    {
      id: "win-opponent-turn",
      type: "narration",
      title: "Opponent's Desperate Turn",
      text: "The opponent is at Death's Door with no way to recover — they can't gain life. They take their turn but can't stop what's coming.",
      statePatches: [
        { op: "set_current_player", value: "p1" },
        { op: "set_phase", value: "Main" },
        { op: "set_turn", value: 9 },
        { op: "untap_all", player: "p1" },
      ],
    },
    {
      id: "win-death-blow-explain",
      type: "narration",
      title: "The Death Blow",
      text: "It's your turn again. The Flamecaller is at Death's Door (0 life). Any damage dealt to them now is a **Death Blow** — ending the game!\n\nYour Cave Trolls are at Humble Village. Move them to the Red Desert and attack the enemy Avatar directly.",
    },
    {
      id: "win-move-trolls",
      type: "forced_action",
      title: "Move Cave Trolls Forward",
      text: "Move the **Cave Trolls** from Humble Village to the Red Desert.",
      requiredAction: {
        type: "move_unit",
        unitName: "Cave Trolls",
        from: 13,
        to: 8,
      },
      hintText: "Tap the Cave Trolls and move them one step forward from tile 13 to tile 8 (Red Desert).",
      showHint: true,
      statePatches: [
        { op: "remove_permanent", tile: 13, cardName: "Cave Trolls" },
        { op: "place_permanent", permanent: { owner: "p1", tile: 8, card: { cardId: 102, name: "Cave Trolls", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { earth: 1 }, slug: "bet-cave_trolls-b-s" }, tapped: true } },
      ],
    },
    {
      id: "win-victory",
      type: "narration",
      title: "Victory!",
      text: "The Cave Trolls attack the Flamecaller for **3 damage** — a **Death Blow!** The Flamecaller's connection to the realm is severed.\n\n**You win!** You have claimed dominion over the contested realm!",
    },
    {
      id: "win-summary",
      type: "narration",
      title: "What You've Learned",
      text: "Congratulations! You've completed the Sorcery tutorial. Here's a summary:\n\n- **Sites** provide mana and elemental affinity\n- **Mana** is spent to cast spells; **threshold** is a minimum requirement (not spent)\n- **Minions** fight for you — they attack, defend, and intercept\n- **Movement** is one step at a time to adjacent sites\n- **Combat** is simultaneous — both units strike at the same time\n- **Death's Door** (0 life) → **Death Blow** (any damage next turn) = Victory!\n- If a player draws from an empty deck, they lose immediately",
    },
    {
      id: "win-next-steps",
      type: "narration",
      title: "What's Next?",
      text: "You're ready for real games! Try:\n\n- **Teaching Mode** — play with a friend who can guide you\n- **Bot Match** — practice against an AI opponent\n- **Online Match** — battle other players\n\nThere are many more mechanics to discover: Artifacts, Auras, Magics, keyword abilities like Airborne and Burrowing, and much more. The best way to learn is by playing!",
    },
    {
      id: "win-complete",
      type: "checkpoint",
      title: "Tutorial Complete!",
      text: "You've completed all tutorial lessons. Welcome to Sorcery: Contested Realm!",
    },
  ],
};

export default lesson;
