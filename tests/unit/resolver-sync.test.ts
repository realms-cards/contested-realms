import { describe, expect, it } from "vitest";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, CellKey, GameState, ServerPatchT } from "@/lib/game/store";
import { isEvilCard } from "@/lib/game/store/utils/cardHelpers";
import { deepMergeReplaceArrays } from "@/lib/game/store/utils/patchHelpers";
import { triggerCardResolvers } from "@/lib/game/store/utils/resolverTriggers";
import type { GameTransport } from "@/lib/net/transport";
import { RESOLVER_RELAY_MESSAGE_TYPES } from "../../server/modules/resolver-messages";

/**
 * Resolvers are hard to test by hand because a bug usually only shows up on the
 * OTHER player's client: the effect works locally, the patch or message that
 * should carry it is malformed, and the two clients silently diverge.
 *
 * These tests encode the four server-side rules that decide whether a resolver
 * patch survives, so a resolver can be checked without running two browsers.
 */

type PermanentEntry = {
  instanceId: string;
  card: CardRef;
  owner: 1 | 2;
  tapped?: boolean;
  __remove?: boolean;
};

function card(name: string, cardId: number, extra: Partial<CardRef> = {}): CardRef {
  return {
    cardId,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    type: "Minion",
    instanceId: `inst_${cardId}`,
    owner: "p1",
    ...extra,
  } as CardRef;
}

function createRecordingTransport(sent: Array<Record<string, unknown>>): GameTransport {
  return {
    connect: async () => {},
    disconnect: () => {},
    joinMatch: async () => {},
    leaveMatch: () => {},
    ready: () => {},
    startMatch: () => {},
    sendAction: () => {},
    sendMessage: (msg: unknown) => {
      sent.push(msg as Record<string, unknown>);
    },
    mulliganDone: () => {},
    sendChat: () => {},
    resync: () => {},
    on: () => () => {},
  } as unknown as GameTransport;
}

/**
 * Mirror of the server's patch acceptance rules.
 *
 * - `server/modules/rules-validation.ts` (~573-593) + `match-leader.ts`
 *   (~1244-1258): a patch carrying the NON-acting seat's avatar with a
 *   `tapped` key is rejected outright, and the whole patch is dropped.
 * - `match-leader.ts` (~1475-1570): a `zones` write for the other seat is
 *   dropped unless the patch carries `__allowZoneSeats` naming that seat.
 * - `server/modules/shared/match-helpers.ts` (~141-259): permanents merge per
 *   cell by `instanceId`, and base entries missing from the patch are kept
 *   unless the patch marks them `__remove: true`.
 */
function applyPatchAsServer(
  serverState: Record<string, unknown>,
  patch: ServerPatchT,
  actorSeat: "p1" | "p2",
): { accepted: boolean; reason?: string; next: Record<string, unknown> } {
  const patchRecord = patch as unknown as Record<string, unknown>;

  const avatars = patchRecord.avatars;
  if (avatars && typeof avatars === "object") {
    for (const [seat, value] of Object.entries(avatars as Record<string, unknown>)) {
      if (seat === actorSeat) continue;
      if (
        value &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, "tapped")
      ) {
        return {
          accepted: false,
          reason: "Cannot tap or untap opponent avatar",
          next: serverState,
        };
      }
    }
  }

  const sanitized: Record<string, unknown> = { ...patchRecord };
  const allowRaw = patchRecord.__allowZoneSeats;
  const allowed = Array.isArray(allowRaw) ? (allowRaw as string[]) : [];
  delete sanitized.__allowZoneSeats;

  const zones = sanitized.zones;
  if (zones && typeof zones === "object") {
    const outZones: Record<string, unknown> = {};
    for (const [seat, value] of Object.entries(zones as Record<string, unknown>)) {
      if (seat === actorSeat || allowed.includes(seat)) outZones[seat] = value;
    }
    if (Object.keys(outZones).length > 0) sanitized.zones = outZones;
    else delete sanitized.zones;
  }

  return {
    accepted: true,
    next: deepMergeReplaceArrays(
      serverState as Record<string, unknown>,
      sanitized,
    ) as Record<string, unknown>,
  };
}

describe("server patch acceptance rules", () => {
  it("rejects the whole patch when it carries the opponent's avatar tapped flag", () => {
    // This is the failure mode that silently broke Mephistopheles, Druid and
    // Babel Tower: the effect applied locally and never reached the opponent.
    const result = applyPatchAsServer(
      { avatars: { p1: { tapped: false }, p2: { tapped: false } } },
      {
        avatars: {
          p1: { tapped: true },
          p2: { tapped: false },
        },
      } as unknown as ServerPatchT,
      "p1",
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/opponent avatar/i);
  });

  it("accepts a patch that carries only the acting seat's avatar", () => {
    const result = applyPatchAsServer(
      { avatars: { p1: { tapped: false }, p2: { tapped: false } } },
      { avatars: { p1: { tapped: true } } } as unknown as ServerPatchT,
      "p1",
    );
    expect(result.accepted).toBe(true);
    const avatars = result.next.avatars as Record<string, { tapped: boolean }>;
    expect(avatars.p1.tapped).toBe(true);
    expect(avatars.p2.tapped).toBe(false);
  });

  it("keeps a permanent that a patch omits, and deletes one marked __remove", () => {
    const base = {
      permanents: {
        "2,3": [
          { instanceId: "a", card: card("Keeper", 1), owner: 1 },
          { instanceId: "b", card: card("Doomed", 2), owner: 1 },
        ] as PermanentEntry[],
      },
    };

    // Locally filtering "b" out and sending the shortened array does NOT
    // delete it: the server preserves base entries missing from the patch.
    const withoutRemoveFlag = applyPatchAsServer(
      base,
      {
        permanents: {
          "2,3": [{ instanceId: "a", card: card("Keeper", 1), owner: 1 }],
        },
      } as unknown as ServerPatchT,
      "p1",
    );
    const survived = (
      withoutRemoveFlag.next.permanents as Record<string, PermanentEntry[]>
    )["2,3"];
    expect(survived.map((p) => p.instanceId).sort()).toEqual(["a", "b"]);

    // Marking it __remove actually deletes it.
    const withRemoveFlag = applyPatchAsServer(
      base,
      {
        permanents: {
          "2,3": [
            { instanceId: "b", card: card("Doomed", 2), owner: 1, __remove: true },
          ],
        },
      } as unknown as ServerPatchT,
      "p1",
    );
    const remaining = (
      withRemoveFlag.next.permanents as Record<string, PermanentEntry[]>
    )["2,3"];
    expect(remaining.map((p) => p.instanceId)).toEqual(["a"]);
  });

  it("drops an opponent zone write unless __allowZoneSeats names that seat", () => {
    const base = {
      zones: {
        p1: { graveyard: [] as CardRef[] },
        p2: { graveyard: [card("Corpse", 7)] },
      },
    };

    // Raise Dead's bug: it pulled a minion out of the opponent's cemetery
    // without the flag, so the minion entered play AND stayed in the graveyard.
    const stripped = applyPatchAsServer(
      base,
      { zones: { p2: { graveyard: [] } } } as unknown as ServerPatchT,
      "p1",
    );
    const strippedZones = stripped.next.zones as Record<
      string,
      { graveyard: CardRef[] }
    >;
    expect(strippedZones.p2.graveyard).toHaveLength(1);

    const allowed = applyPatchAsServer(
      base,
      {
        zones: { p2: { graveyard: [] } },
        __allowZoneSeats: ["p2"],
      } as unknown as ServerPatchT,
      "p1",
    );
    const allowedZones = allowed.next.zones as Record<
      string,
      { graveyard: CardRef[] }
    >;
    expect(allowedZones.p2.graveyard).toHaveLength(0);
  });
});

describe("resolver message relay allowlist", () => {
  // The server relays custom messages from an explicit allowlist and has no
  // fallback, so a resolver whose type is missing is silently opponent-blind.
  // These are the types a resolver flow cannot work without.
  const REQUIRED = [
    "accusationBegin",
    "accusationResolve",
    "inquisitionBegin",
    "inquisitionResolve",
    "feastForCrowsResolve",
    "legionOfGallResolve",
    "kingswoodPoachersResolve",
    "searingTruthBegin",
    "searingTruthResolve",
    // Regressions fixed in this pass:
    "searingTruthConfirm", // target's authoritative damage reply to the caster
    "combatAssign", // damage assignment sub-step of an otherwise relayed flow
    "magicConfirm", // confirm sub-step of the generic magic cast
    "revealCards", // "show the opponent" reveal overlay
    "piracyTrigger", // Sea Raider reveal for the defender
  ];

  it.each(REQUIRED)("relays %s", (type) => {
    expect(RESOLVER_RELAY_MESSAGE_TYPES.has(type)).toBe(true);
  });

  it("does not relay unknown message types", () => {
    expect(RESOLVER_RELAY_MESSAGE_TYPES.has("notARealResolverMessage")).toBe(
      false,
    );
  });
});

describe("Evil card detection", () => {
  // Doomsday Cult tested `subTypes.includes("evil")`, but no card carries an
  // "Evil" subtype: Evil is the Demon/Undead/Monster group. The check could
  // never pass, so the ability was unusable.
  it("treats Demon, Undead and Monster as Evil", () => {
    expect(isEvilCard(card("Demon Lord", 10, { subTypes: "Demon" }))).toBe(true);
    expect(isEvilCard(card("Skeleton", 11, { subTypes: "Undead" }))).toBe(true);
    expect(isEvilCard(card("Beast", 12, { subTypes: "Monster" }))).toBe(true);
  });

  it("does not treat ordinary subtypes as Evil", () => {
    expect(isEvilCard(card("Villager", 13, { subTypes: "Mortal" }))).toBe(false);
    expect(isEvilCard(card("No Subtype", 14))).toBe(false);
    expect(isEvilCard(null)).toBe(false);
  });

  it("does not depend on a literal 'Evil' subtype", () => {
    // Guards the original bug: nothing in the card data has this subtype.
    expect(isEvilCard(card("Fake", 15, { subTypes: "Evil" }))).toBe(false);
  });
});

describe("Demonic Contract is reachable", () => {
  it("dispatches to its resolver when the card is placed", () => {
    // beginDemonicContract had no call site at all: casting the card did
    // nothing but put a permanent on the board.
    const store = createGameStore();
    let began = false;
    store.setState({
      beginDemonicContract: async () => {
        began = true;
      },
    } as unknown as Partial<GameState> as GameState);

    const triggered = triggerCardResolvers({
      card: card("Demonic Contract", 999, { type: "Magic" }),
      key: "2,3" as CellKey,
      permanentIndex: 0,
      instanceId: "inst_999",
      owner: 1,
      ownerSeat: "p1",
      get: store.getState,
    });

    expect(triggered).toBe(true);
    expect(began).toBe(true);
  });
});

describe("Assorted Animals mana accounting", () => {
  // players[seat].mana is a spend OFFSET added to base site mana, so paying X
  // must SUBTRACT. The resolver added it, granting mana instead of spending it.
  it("offers exactly the mana the shared resource helper reports", async () => {
    const store = createGameStore();
    const state = store.getState();
    state.setActorKey("p1");

    const available = state.getAvailableMana("p1");
    await state.beginAssortedAnimals({
      spell: {
        at: "2,3" as CellKey,
        index: 0,
        instanceId: "spell_1",
        owner: 1,
        card: card("Assorted Animals", 500, { type: "Magic" }),
      },
      casterSeat: "p1",
      xValue: 3,
    });

    expect(store.getState().pendingAssortedAnimals?.maxMana).toBe(available);
  });

  it("spends X rather than granting it", async () => {
    const store = createGameStore();
    const state = store.getState();
    state.setActorKey("p1");

    store.setState({
      players: {
        ...state.players,
        p1: { ...state.players.p1, mana: 0 },
      },
    } as unknown as Partial<GameState> as GameState);

    store.setState({
      pendingAssortedAnimals: {
        id: "aa_test",
        spell: {
          at: "2,3" as CellKey,
          index: 0,
          instanceId: "spell_1",
          owner: 1,
          card: card("Assorted Animals", 500, { type: "Magic" }),
        },
        casterSeat: "p1",
        phase: "choosing_x",
        maxMana: 4,
        xValue: 0,
        eligibleCards: [],
        selectedCards: [],
        createdAt: Date.now(),
      },
    } as unknown as Partial<GameState> as GameState);

    await store.getState().setAssortedAnimalsX(3);

    // Offset went down by 3; before the fix it went UP by 3.
    expect(store.getState().players.p1.mana).toBe(-3);
  });
});

describe("Deathrite triggers run on the card owner's client", () => {
  // movePermanentToZone fires Deathrites on whichever client moved the
  // permanent. When the opponent destroys the minion that is the killer's
  // client, which cannot see the owner's spellbook or atlas: the reveal came
  // out empty and the pending prompt was stuck on a player who could not act.
  function spellbookFor(names: string[]): CardRef[] {
    return names.map((name, i) => card(name, 800 + i));
  }

  it("hands the Pigs Deathrite to the owner instead of revealing locally", () => {
    const store = createGameStore();
    const sent: Array<Record<string, unknown>> = [];
    const state = store.getState();
    state.setTransport(createRecordingTransport(sent));
    state.setActorKey("p1"); // we are the killer, p2 owns the minion

    store.setState({
      zones: {
        ...state.zones,
        p2: {
          ...state.zones.p2,
          spellbook: spellbookFor(["Grand Old Boar", "Filler"]),
        },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerPigsDeathrite({
      ownerSeat: "p2",
      deathLocation: "2,1" as CellKey,
      triggerCardName: "Pigs of the Sounder",
    });

    expect(store.getState().pendingPigsOfTheSounder).toBeNull();
    const request = sent.find((m) => m.type === "pigsDeathriteRequest");
    expect(request).toBeTruthy();
    expect(request?.ownerSeat).toBe("p2");
    expect(request?.deathLocation).toBe("2,1");
  });

  it("reveals locally when the owner's own client runs the Pigs Deathrite", () => {
    const store = createGameStore();
    const sent: Array<Record<string, unknown>> = [];
    const state = store.getState();
    state.setTransport(createRecordingTransport(sent));
    state.setActorKey("p2"); // we own the minion

    store.setState({
      zones: {
        ...state.zones,
        p2: {
          ...state.zones.p2,
          spellbook: spellbookFor(["Grand Old Boar", "Filler"]),
        },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerPigsDeathrite({
      ownerSeat: "p2",
      deathLocation: "2,1" as CellKey,
      triggerCardName: "Pigs of the Sounder",
    });

    const pending = store.getState().pendingPigsOfTheSounder;
    expect(pending?.ownerSeat).toBe("p2");
    expect(pending?.revealedCards).toHaveLength(2);
    expect(sent.some((m) => m.type === "pigsDeathriteRequest")).toBe(false);
    expect(sent.some((m) => m.type === "pigsDeathrite")).toBe(true);
  });

  it("hands the Kettletop Deathrite to the owner instead of drawing locally", () => {
    const store = createGameStore();
    const sent: Array<Record<string, unknown>> = [];
    const state = store.getState();
    state.setTransport(createRecordingTransport(sent));
    state.setActorKey("p1"); // killer

    store.setState({
      zones: {
        ...state.zones,
        p2: { ...state.zones.p2, atlas: spellbookFor(["Some Site"]) },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerKettletopDeathrite({
      ownerSeat: "p2",
      deathLocation: "3,1" as CellKey,
    });

    expect(store.getState().pendingKettletopLeprechaun).toBeNull();
    expect(sent.some((m) => m.type === "kettletopDeathriteRequest")).toBe(true);
    expect(sent.some((m) => m.type === "kettletopBegin")).toBe(false);
  });

  it("prompts locally when the owner's own client runs the Kettletop Deathrite", () => {
    const store = createGameStore();
    const sent: Array<Record<string, unknown>> = [];
    const state = store.getState();
    state.setTransport(createRecordingTransport(sent));
    state.setActorKey("p2"); // owner

    store.setState({
      zones: {
        ...state.zones,
        p2: { ...state.zones.p2, atlas: spellbookFor(["Some Site"]) },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerKettletopDeathrite({
      ownerSeat: "p2",
      deathLocation: "3,1" as CellKey,
    });

    expect(store.getState().pendingKettletopLeprechaun?.phase).toBe("confirming");
    expect(sent.some((m) => m.type === "kettletopBegin")).toBe(true);
  });

  it("still runs locally in hotseat, where there is no remote client", () => {
    const store = createGameStore();
    const state = store.getState();
    state.setActorKey(null); // hotseat

    store.setState({
      zones: {
        ...state.zones,
        p2: { ...state.zones.p2, atlas: spellbookFor(["Some Site"]) },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerKettletopDeathrite({
      ownerSeat: "p2",
      deathLocation: "3,1" as CellKey,
    });

    expect(store.getState().pendingKettletopLeprechaun?.ownerSeat).toBe("p2");
  });

  it("relays the Deathrite handoff and display messages", () => {
    for (const type of [
      "pigsDeathriteRequest",
      "pigsDeathrite",
      "pigsDeathResolve",
      "kettletopDeathriteRequest",
    ]) {
      expect(RESOLVER_RELAY_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });
});

describe("Piracy grants (Captain Baldassare / Sea Raider)", () => {
  // "the defending player discards their topmost three spells. You may cast
  // each of those spells once this turn, ignoring threshold requirements."
  // Only the discard used to be implemented.
  function setupPiracy(actor: "p1" | "p2" | null) {
    const store = createGameStore();
    const sent: Array<Record<string, unknown>> = [];
    const state = store.getState();
    state.setTransport(createRecordingTransport(sent));
    state.setActorKey(actor);
    store.setState({
      zones: {
        ...state.zones,
        p2: {
          ...state.zones.p2,
          spellbook: [
            card("Pirated One", 900, { type: "Magic", cost: 0 }),
            card("Pirated Two", 901, { type: "Magic", cost: 0 }),
            card("Pirated Three", 902, { type: "Magic", cost: 0 }),
            card("Untouched", 903, { type: "Magic", cost: 0 }),
          ],
          graveyard: [],
        },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerPiracy({
      source: {
        at: "2,2" as CellKey,
        index: 0,
        instanceId: "baldassare_1",
        owner: 1,
        card: card("Captain Baldassare", 910),
      },
      attackerSeat: "p1",
      discardCount: 3,
    });
    return { store, sent };
  }

  it("discards three spells to the defender's cemetery", () => {
    const { store } = setupPiracy("p1");
    const zones = store.getState().zones;
    expect(zones.p2.spellbook.map((c) => c.name)).toEqual(["Untouched"]);
    expect(zones.p2.graveyard.map((c) => c.name)).toEqual([
      "Pirated One",
      "Pirated Two",
      "Pirated Three",
    ]);
  });

  it("grants the attacker one cast of each discarded spell this turn", () => {
    const { store } = setupPiracy("p1");
    const grants = store.getState().piracyGrants;
    expect(grants).toHaveLength(3);
    for (const g of grants) {
      expect(g.granteeSeat).toBe("p1");
      expect(g.fromSeat).toBe("p2");
      expect(g.used).toBe(false);
      expect(g.turn).toBe(store.getState().turn);
      expect(g.instanceId).toBeTruthy();
    }
  });

  it("casts a granted spell out of the opponent's cemetery onto the board", () => {
    const { store } = setupPiracy("p1");
    const grant = store.getState().piracyGrants[0];

    store.getState().castFromPiracyGrant(grant.id, { x: 1, y: 2 });

    const after = store.getState();
    const placed = after.permanents["1,2"] || [];
    expect(placed).toHaveLength(1);
    expect(placed[0].card.name).toBe("Pirated One");
    // Cast by p1, but still p2's card: it must return to p2's cemetery.
    expect(placed[0].owner).toBe(1);
    expect(
      (placed[0] as unknown as { originalOwnerSeat?: string })
        .originalOwnerSeat,
    ).toBe("p2");
    // Gone from the cemetery it was cast from.
    expect(after.zones.p2.graveyard.map((c) => c.name)).toEqual([
      "Pirated Two",
      "Pirated Three",
    ]);
  });

  it("allows each granted spell only once", () => {
    const { store } = setupPiracy("p1");
    const grant = store.getState().piracyGrants[0];

    store.getState().castFromPiracyGrant(grant.id, { x: 1, y: 2 });
    expect(
      store.getState().piracyGrants.find((g) => g.id === grant.id)?.used,
    ).toBe(true);

    // A second attempt must not place another copy.
    store.getState().castFromPiracyGrant(grant.id, { x: 3, y: 2 });
    expect(store.getState().permanents["3,2"] || []).toHaveLength(0);
  });

  it("ignores threshold requirements but still charges mana", () => {
    const store = createGameStore();
    const sent: Array<Record<string, unknown>> = [];
    const state = store.getState();
    state.setTransport(createRecordingTransport(sent));
    state.setActorKey("p1");

    // A spell with an elemental threshold p1 cannot possibly meet.
    const pricey = card("Costly Water Spell", 920, {
      type: "Magic",
      cost: 2,
      thresholds: { air: 0, earth: 0, fire: 0, water: 3 },
    });
    store.setState({
      zones: {
        ...state.zones,
        p2: { ...state.zones.p2, spellbook: [pricey], graveyard: [] },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().triggerPiracy({
      source: {
        at: "2,2" as CellKey,
        index: 0,
        instanceId: "baldassare_1",
        owner: 1,
        card: card("Captain Baldassare", 910),
      },
      attackerSeat: "p1",
      discardCount: 3,
    });

    const grant = store.getState().piracyGrants[0];
    const manaBefore = store.getState().players.p1.mana;

    // No mana available -> refused (mana is still a cost).
    store.getState().castFromPiracyGrant(grant.id, { x: 1, y: 2 });
    expect(store.getState().permanents["1,2"] || []).toHaveLength(0);

    // With mana available the threshold is NOT an obstacle.
    store.setState({
      players: {
        ...store.getState().players,
        p1: { ...store.getState().players.p1, mana: manaBefore + 5 },
      },
    } as unknown as Partial<GameState> as GameState);

    store.getState().castFromPiracyGrant(grant.id, { x: 1, y: 2 });
    expect(store.getState().permanents["1,2"] || []).toHaveLength(1);
    // 2 mana paid.
    expect(store.getState().players.p1.mana).toBe(manaBefore + 5 - 2);
  });

  it("refuses a cast by the player who was pirated", () => {
    const { store } = setupPiracy("p2"); // we are the defender
    const grant = store.getState().piracyGrants[0];
    store.getState().castFromPiracyGrant(grant.id, { x: 1, y: 2 });
    expect(store.getState().permanents["1,2"] || []).toHaveLength(0);
  });

  it("refuses a cast once the granting turn has passed", () => {
    const { store } = setupPiracy("p1");
    const grant = store.getState().piracyGrants[0];
    store.setState({ turn: store.getState().turn + 1 } as unknown as Partial<
      GameState
    > as GameState);
    store.getState().castFromPiracyGrant(grant.id, { x: 1, y: 2 });
    expect(store.getState().permanents["1,2"] || []).toHaveLength(0);
  });

  it("expires all grants when the turn ends", () => {
    const { store } = setupPiracy("p1");
    expect(store.getState().piracyGrants).toHaveLength(3);
    store.getState()._executeTurnTransition();
    expect(store.getState().piracyGrants).toHaveLength(0);
  });

  it("sends the defender's cemetery change with __allowZoneSeats", () => {
    const { store, sent } = setupPiracy("p1");
    // triggerPiracy patches the defender's zones; the attacker is not that
    // seat, so without the flag the server would strip the write.
    const state = store.getState();
    expect(state.zones.p2.graveyard).toHaveLength(3);
    expect(sent.some((m) => m.type === "piracyTrigger")).toBe(true);
  });
});
