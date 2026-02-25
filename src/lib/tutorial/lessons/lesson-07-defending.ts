import type { TutorialLesson } from "../types";

/**
 * Lesson 7: Defending & Intercepting
 * Teaches: Defend trigger, intercept trigger, opponent's turn reactions,
 * multiple combatants, tactical positioning.
 */
const lesson: TutorialLesson = {
  id: "lesson-07-defending",
  title: "Defending & Intercepting",
  description:
    "Learn to protect your sites and allies using the Defend and Intercept abilities on your opponent's turn.",
  order: 7,
  concepts: ["defending", "intercepting"],
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
      life: 18,
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
        4: { owner: 2, card: { cardId: 404, name: "Shifting Sands", type: "Site", thresholds: { fire: 1 }, slug: "bet-shifting_sands-b-s" } },
      },
    },
    permanents: [
      { owner: "p1", tile: 13, card: { cardId: 101, name: "Amazon Warriors", type: "Minion", cost: 5, attack: 5, defence: 5, thresholds: { earth: 1 }, slug: "bet-amazon_warriors-b-s" } },
      { owner: "p1", tile: 14, card: { cardId: 107, name: "Royal Bodyguard", type: "Minion", cost: 4, attack: 4, defence: 4, thresholds: { earth: 2 }, slug: "bet-royal_bodyguard-b-s" } },
      { owner: "p2", tile: 8, card: { cardId: 302, name: "Ogre Goons", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { fire: 1 }, slug: "bet-ogre_goons-b-s" } },
    ],
    phase: "Main",
    currentPlayer: "p2",
    turn: 7,
  },
  steps: [
    {
      id: "defend-intro",
      type: "narration",
      title: "Your Opponent's Turn",
      text: "It's now your opponent's turn. During their Main Phase, they can move and attack your units and sites. But you're not helpless! You have two **triggered abilities** you can use: **Defend** and **Intercept**.",
    },
    {
      id: "defend-explain",
      type: "narration",
      title: "Defend",
      text: "**Defend** triggers when an enemy attacks a unit or site within your unit's **range of motion**. Your untapped unit can tap to move to the attack's location and join the fight.\n\nKey rules:\n- Any number of your units can defend against one attacker\n- The defender can use movement abilities (like Movement +X)\n- If the original target was a unit, you choose whether it stays in the fight\n- If the original target was a site, it's automatically removed from the fight",
    },
    {
      id: "defend-scenario",
      type: "narration",
      title: "The Attack",
      text: "The opponent's **Ogre Goons** (power 3) are about to attack your **Humble Village**! If undefended, the Ogre Goons will strike the site for 3 damage, causing you to lose 3 life.\n\nBut your **Amazon Warriors** are standing right there at Humble Village — and your **Royal Bodyguard** is one step away at Vantage Hills.",
    },
    {
      id: "defend-opponent-attacks",
      type: "scripted_action",
      title: "Enemy Attacks!",
      text: "The Ogre Goons move to Humble Village and attack your site!",
      scriptedAction: {
        type: "move_unit",
        unitName: "Ogre Goons",
        from: 8,
        to: 13,
      },
      duration: 1500,
      statePatches: [
        { op: "remove_permanent", tile: 8, cardName: "Ogre Goons" },
        { op: "place_permanent", permanent: { owner: "p2", tile: 13, card: { cardId: 302, name: "Ogre Goons", type: "Minion", cost: 3, attack: 3, defence: 3, thresholds: { fire: 1 }, slug: "bet-ogre_goons-b-s" }, tapped: true } },
      ],
    },
    {
      id: "defend-choice",
      type: "narration",
      title: "Time to Defend!",
      text: "The Ogre Goons are attacking your Humble Village. Your **Amazon Warriors** are right there — but the smarter play is to send in the **Royal Bodyguard** from Vantage Hills instead!\n\nWhy? The Bodyguard (power 4) can easily handle the Ogre Goons (power 3) and survive. This keeps the Amazon Warriors **untapped** and ready for your next turn. Even better — after defending, both units end up stacked on Humble Village in attack position. With the opponent out of mana, they can't punish you for grouping up!",
    },
    {
      id: "defend-resolve",
      type: "narration",
      title: "Fight Resolution",
      text: "The Royal Bodyguard moves from Vantage Hills to Humble Village and defends! Both units fight simultaneously:\n\n- Royal Bodyguard strikes for **4 damage** → Ogre Goons (power 3) are destroyed!\n- Ogre Goons strike for **3 damage** → Royal Bodyguard (power 4) survives\n\nThe Ogre Goons are destroyed and your site is safe. The Bodyguard's damage heals at end of turn, and the Amazon Warriors remain untapped — ready to attack on your next turn!",
      statePatches: [
        { op: "remove_permanent", tile: 13, cardName: "Ogre Goons" },
        { op: "remove_permanent", tile: 14, cardName: "Royal Bodyguard" },
        { op: "place_permanent", permanent: { owner: "p1", tile: 13, card: { cardId: 107, name: "Royal Bodyguard", type: "Minion", cost: 4, attack: 4, defence: 4, thresholds: { earth: 2 }, slug: "bet-royal_bodyguard-b-s" }, tapped: true } },
      ],
    },
    {
      id: "intercept-explain",
      type: "narration",
      title: "Intercept",
      text: "**Intercept** works differently. It triggers when an enemy finishes moving (using Move and Attack) and then **chooses not to attack**.\n\nAny of your untapped units already at that location can tap to force a fight.\n\nIntercept prevents enemies from sneaking past your defenses without consequence!",
    },
    {
      id: "defend-tactics",
      type: "narration",
      title: "Defensive Tactics",
      text: "Good defense wins games! Remember:\n\n- Choose **which** unit defends wisely — we used the Bodyguard to keep the stronger Amazon Warriors untapped\n- A unit that defends gets **tapped** — it can't act again until your next turn\n- After defending, both units ended up stacked on Humble Village — a strong position for your next turn's attack\n- Consider your opponent's remaining resources — with them out of mana, stacking units was safe",
    },
    {
      id: "defend-complete",
      type: "checkpoint",
      title: "Defense Mastered!",
      text: "You now know how to protect your domain. In the final lesson, we'll cover Death's Door and how to win the game!",
    },
  ],
};

export default lesson;
