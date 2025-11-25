import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CellKey,
  GameState,
  Permanents,
  PlayerKey,
  SiteTile,
} from "./types";
import {
  getCellNumber,
  opponentOwner,
  opponentSeat,
  seatFromOwner,
  toCellKey,
} from "./utils/boardHelpers";

type CombatSlice = Pick<
  GameState,
  | "commitDefenders"
  | "setDamageAssignment"
  | "pendingCombat"
  | "attackChoice"
  | "attackTargetChoice"
  | "attackConfirm"
  | "setAttackChoice"
  | "setAttackTargetChoice"
  | "setAttackConfirm"
  | "revertCrossMoveTick"
  | "requestRevertCrossMove"
  | "lastCombatSummary"
  | "setLastCombatSummary"
  | "declareAttack"
  | "offerIntercept"
  | "setDefenderSelection"
  | "resolveCombat"
  | "autoResolveCombat"
  | "cancelCombat"
>;

export const createCombatSlice: StateCreator<GameState, [], [], CombatSlice> = (
  set,
  get
) => ({
  pendingCombat: null,
  attackChoice: null,
  attackTargetChoice: null,
  attackConfirm: null,
  setAttackChoice: (value) => set({ attackChoice: value }),
  setAttackTargetChoice: (value) => set({ attackTargetChoice: value }),
  setAttackConfirm: (value) => set({ attackConfirm: value }),
  revertCrossMoveTick: 0,
  requestRevertCrossMove: () =>
    set((state) => ({
      revertCrossMoveTick: (state.revertCrossMoveTick || 0) + 1,
    })),
  lastCombatSummary: null,
  setLastCombatSummary: (summary) =>
    set({ lastCombatSummary: summary } as Partial<GameState> as GameState),

  commitDefenders: () => {
    const pending = get().pendingCombat;
    if (!pending) return;
    set((state) => {
      if (!state.pendingCombat) return state as GameState;
      return {
        pendingCombat: { ...state.pendingCombat, status: "committed" },
      } as Partial<GameState> as GameState;
    });
    const updated = get().pendingCombat;
    if (!updated) return;
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "combatCommit",
          id: updated.id,
          defenders: updated.defenders,
          target: updated.target ?? null,
          tile: updated.tile,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch (error) {
        console.error("[commitDefenders] Error sending combatCommit:", error);
      }
    }
  },

  setDamageAssignment: (assignment) => {
    const pending = get().pendingCombat;
    if (!pending || pending.status !== "committed") return false;
    const { permanents, metaByCardId } = get();

    function getAtkDef(
      at: string,
      index: number
    ): { atk: number; def: number } {
      try {
        const cardId =
          (permanents as Permanents)[at]?.[index]?.card?.cardId ?? null;
        const meta = cardId
          ? (
              metaByCardId as Record<
                number,
                { attack: number | null; defence: number | null }
              >
            )[Number(cardId)]
          : undefined;
        const atk = Number(meta?.attack ?? 0) || 0;
        const def = Number(meta?.defence ?? meta?.attack ?? 0) || 0;
        return { atk, def };
      } catch {
        return { atk: 0, def: 0 };
      }
    }

    function getAttachments(at: string, index: number): Permanents[string] {
      const list = (permanents as Permanents)[at] || [];
      return list.filter(
        (p) =>
          p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index
      );
    }

    function computeEffectiveAttack(input: { at: CellKey; index: number }): {
      atk: number;
      firstStrike: boolean;
    } {
      const base = getAtkDef(input.at, input.index).atk;
      const attachments = getAttachments(input.at, input.index);
      let atk = base;
      let firstStrike = false;
      let disabled = false;
      for (const token of attachments) {
        const name = (token.card?.name || "").toLowerCase();
        if (name === "lance") {
          firstStrike = true;
          atk += 1;
        }
        if (name === "disabled") {
          disabled = true;
        }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }

    const eff = computeEffectiveAttack({
      at: pending.attacker.at,
      index: pending.attacker.index,
    });
    if (!Array.isArray(assignment)) return false;
    const defenderKeys = new Set(
      (pending.defenders || []).map((d) => `${d.at}:${d.index}`)
    );
    let sum = 0;
    for (const entry of assignment) {
      if (!entry || typeof entry !== "object") return false;
      if (
        typeof entry.at !== "string" ||
        !Number.isFinite(Number(entry.index)) ||
        !Number.isFinite(Number(entry.amount))
      ) {
        return false;
      }
      if (!defenderKeys.has(`${entry.at}:${entry.index}`)) return false;
      if (entry.amount < 0) return false;
      sum += Math.floor(Number(entry.amount));
    }
    if (sum !== Math.floor(eff.atk)) return false;
    set((state) => {
      if (!state.pendingCombat) return state as GameState;
      return {
        pendingCombat: {
          ...state.pendingCombat,
          assignment: assignment.map((x) => ({
            at: x.at,
            index: Number(x.index),
            amount: Math.floor(Number(x.amount)),
          })),
        },
      } as Partial<GameState> as GameState;
    });
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "combatAssign",
          id: pending.id,
          assignment,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch (error) {
        console.error(
          "[setDamageAssignment] Error sending combatAssign:",
          error
        );
      }
    }
    return true;
  },

  declareAttack: (tile, attacker, target) =>
    set((state) => {
      const id = `cmb_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const defenderSeat = opponentSeat(seatFromOwner(attacker.owner));
      const combatState = {
        id,
        tile,
        attacker,
        target: target ?? null,
        defenderSeat,
        defenders: [],
        status: "declared" as const,
        createdAt: Date.now(),
      };
      const transport = get().transport;
      const attackerLabel = (() => {
        try {
          const source =
            (get().permanents as Permanents)[attacker.at]?.[attacker.index] ??
            null;
          return source?.card?.name || "Attacker";
        } catch {
          return "Attacker";
        }
      })();
      const targetLabel = (() => {
        try {
          if (!target) return null;
          if (target.kind === "site") return "Site";
          if (target.kind === "avatar") return "Avatar";
          const list = (get().permanents as Permanents)[target.at] || [];
          const permanent =
            target.index != null && list[target.index]
              ? list[target.index]
              : null;
          return permanent?.card?.name || "Unit";
        } catch {
          return null;
        }
      })();
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "attackDeclare",
            id,
            tile,
            attacker,
            target: target ?? null,
            playerKey: state.actorKey ?? null,
            ts: Date.now(),
          } as unknown as CustomMessage);
          if (targetLabel) {
            transport.sendMessage({
              type: "toast",
              text: `${attackerLabel} attacks ${targetLabel}`,
            } as unknown as CustomMessage);
          }
        } catch (error) {
          console.error("[declareAttack] Error sending attackDeclare:", error);
        }
      }
      try {
        const cellNo = getCellNumber(tile.x, tile.y, state.board.size.w);
        if (targetLabel) {
          get().log(`${attackerLabel} attacks ${targetLabel} at #${cellNo}`);
        } else {
          get().log(`Attack declared at #${cellNo}`);
        }
      } catch {
        // no-op
      }
      return { pendingCombat: combatState } as Partial<GameState> as GameState;
    }),

  offerIntercept: (tile, attacker) => {
    try {
      const defenderSeat = opponentSeat(seatFromOwner(attacker.owner));
      const key = toCellKey(tile.x, tile.y);
      const allPermanents = get().permanents as Permanents;
      const unitsHere = (allPermanents[key] || []).filter(
        (p) => p && p.owner === opponentOwner(attacker.owner) && !p.tapped
      );
      let avatarHere = false;
      try {
        const avatar = (get().avatars as GameState["avatars"])[defenderSeat];
        if (
          avatar &&
          Array.isArray(avatar.pos) &&
          avatar.pos.length === 2 &&
          avatar.pos[0] === tile.x &&
          avatar.pos[1] === tile.y &&
          !avatar.tapped
        ) {
          avatarHere = true;
        }
      } catch {
        // ignore
      }
      if (unitsHere.length === 0 && !avatarHere) return;
      const id = `cmb_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "interceptOffer",
            id,
            tile,
            attacker,
            playerKey: get().actorKey ?? null,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch (error) {
          console.error(
            "[offerIntercept] Error sending interceptOffer:",
            error
          );
        }
      }
      try {
        get().log("Intercept offered to defender");
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  },

  setDefenderSelection: (defenders) => {
    set((state) => {
      if (!state.pendingCombat) return state as GameState;
      return {
        pendingCombat: {
          ...state.pendingCombat,
          defenders,
          status: "defending",
        },
      } as Partial<GameState> as GameState;
    });
    const pending = get().pendingCombat;
    const transport = get().transport;
    if (pending && transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "combatSetDefenders",
          id: pending.id,
          defenders,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        transport.sendMessage({
          type: "toast",
          text: `Acting player chose ${defenders.length} defender${
            defenders.length === 1 ? "" : "s"
          }`,
        } as unknown as CustomMessage);
      } catch (error) {
        console.error(
          "[setDefenderSelection] Error sending combatSetDefenders:",
          error
        );
      }
    }
  },

  resolveCombat: () => {
    const pending = get().pendingCombat;
    if (!pending) return;
    const transport = get().transport;
    const existingSummary = get().lastCombatSummary;
    const haveSummary = existingSummary && existingSummary.id === pending.id;
    const permanents = get().permanents as Permanents;
    const meta = get().metaByCardId as Record<
      number,
      { attack: number | null; defence: number | null; cost: number | null }
    >;
    const players = get().players;
    const board = get().board;

    function getAtkDef(
      at: string,
      index: number
    ): { atk: number; def: number } {
      try {
        const cardId = permanents[at]?.[index]?.card?.cardId;
        const info = cardId ? meta[Number(cardId)] : undefined;
        const atk = Number(info?.attack ?? 0) || 0;
        const def = Number(info?.defence ?? info?.attack ?? 0) || 0;
        return { atk, def };
      } catch {
        return { atk: 0, def: 0 };
      }
    }

    function getAttachments(at: string, index: number): Permanents[string] {
      const list = permanents[at] || [];
      return list.filter(
        (p) =>
          p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index
      );
    }

    function listAttachmentEffects(at: string, index: number): string[] {
      const effects: string[] = [];
      for (const token of getAttachments(at, index)) {
        const name = (token.card?.name || "").trim();
        const lowered = name.toLowerCase();
        if (lowered === "lance") effects.push("Lance(+1, FS)");
        else if (lowered === "disabled") effects.push("Disabled(Atk=0)");
        else if (name) effects.push(name);
      }
      return effects;
    }

    function getPermanentName(at: string, index: number): string {
      try {
        return permanents[at]?.[index]?.card?.name || "Unit";
      } catch {
        return "Unit";
      }
    }

    function getAvatarName(seat: PlayerKey): string {
      try {
        return (get().avatars?.[seat]?.card?.name as string) || "Avatar";
      } catch {
        return "Avatar";
      }
    }

    function computeEffectiveAttack(input: { at: CellKey; index: number }): {
      atk: number;
      firstStrike: boolean;
    } {
      const base = getAtkDef(input.at, input.index).atk;
      const attachments = getAttachments(input.at, input.index);
      let atk = base;
      let firstStrike = false;
      let disabled = false;
      for (const token of attachments) {
        const name = (token.card?.name || "").toLowerCase();
        if (name === "lance") {
          firstStrike = true;
          atk += 1;
        }
        if (name === "disabled") {
          disabled = true;
        }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }

    const eff = computeEffectiveAttack({
      at: pending.attacker.at,
      index: pending.attacker.index,
    });
    let summary = "Combat resolved";
    const attackerName = getPermanentName(
      pending.attacker.at,
      pending.attacker.index
    );
    const attachmentEffects = listAttachmentEffects(
      pending.attacker.at,
      pending.attacker.index
    );
    const effectText = attachmentEffects.length
      ? ` [${attachmentEffects.join(", ")}]`
      : "";
    const fsTag = eff.firstStrike ? " (FS)" : "";
    const tileNo = (() => {
      try {
        return getCellNumber(
          pending.tile.x,
          pending.tile.y,
          get().board.size.w
        );
      } catch {
        return null;
      }
    })();
    const actorSeat = seatFromOwner(pending.attacker.owner);
    let targetSeat: PlayerKey | undefined;

    if (pending.target && pending.target.kind === "site") {
      const owner = board.sites[pending.target.at]?.owner as 1 | 2 | undefined;
      const seat =
        owner === 1 || owner === 2
          ? seatFromOwner(owner)
          : (pending.defenderSeat as PlayerKey);
      if (seat) {
        targetSeat = seat;
        const dd = players[seat].lifeState === "dd";
        const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
        const siteName = board.sites[pending.target.at]?.card?.name || "Site";
        const ddNote = dd ? " (DD rule)" : "";
        summary = `Attacker ${attackerName}${effectText}${fsTag} hits Site ${siteName} @#${
          tileNo ?? "?"
        } → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
      }
    } else if (pending.target && pending.target.kind === "avatar") {
      const seat = opponentSeat(actorSeat);
      targetSeat = seat;
      const state = players[seat];
      const avatarName = getAvatarName(seat);
      if (state.lifeState === "dd") {
        summary = `Attacker ${attackerName}${effectText}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${
          tileNo ?? "?"
        } → Expected: ${seat.toUpperCase()} to 0 (lethal from DD, match ends)`;
      } else {
        const life = Number(state.life) || 0;
        const dmg = Math.max(0, Math.floor(eff.atk));
        const next = Math.max(0, life - dmg);
        if (life > 0 && next <= 0) {
          summary = `Attacker ${attackerName}${effectText}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${
            tileNo ?? "?"
          } → Expected: reaches Death's Door; further avatar/site damage this turn won't reduce life`;
        } else {
          summary = `Attacker ${attackerName}${effectText}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${
            tileNo ?? "?"
          } → Expected: ${dmg} dmg (life ${life} → ${next})`;
        }
      }
    } else {
      const tileKey = (() => {
        try {
          return toCellKey(pending.tile.x, pending.tile.y);
        } catch {
          return null;
        }
      })();
      const siteAtTile = tileKey
        ? (board.sites[tileKey] as SiteTile | undefined)
        : undefined;
      if (
        !pending.target &&
        siteAtTile &&
        siteAtTile.card &&
        !pending.defenders?.length
      ) {
        const owner = siteAtTile.owner as 1 | 2 | undefined;
        let seat: PlayerKey | null =
          owner === 1 || owner === 2
            ? seatFromOwner(owner)
            : (pending.defenderSeat as PlayerKey | null);
        if (!seat) {
          seat = opponentSeat(actorSeat);
        }
        if (seat) {
          targetSeat = seat as PlayerKey;
          const dd = players[seat].lifeState === "dd";
          const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
          const siteName = siteAtTile.card?.name || "Site";
          const ddNote = dd ? " (DD rule)" : "";
          summary = `Attacker ${attackerName}${effectText}${fsTag} hits Site ${siteName} @#${
            tileNo ?? "?"
          } → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
        }
      } else {
        const attackerAttack = eff.atk;
        const targetDefense = (() => {
          if (
            pending.target &&
            pending.target.kind === "permanent" &&
            pending.target.index != null
          ) {
            return getAtkDef(pending.target.at, pending.target.index).def;
          }
          if (pending.defenders && pending.defenders.length > 0) {
            return pending.defenders.reduce(
              (sum, defender) =>
                sum + getAtkDef(defender.at, defender.index).def,
              0
            );
          }
          return 0;
        })();
        const targetName =
          pending.target &&
          pending.target.kind === "permanent" &&
          pending.target.index != null
            ? getPermanentName(pending.target.at, pending.target.index)
            : pending.defenders?.length
            ? pending.defenders
                .map((d) => getPermanentName(d.at, d.index))
                .slice(0, 3)
                .join(", ") + (pending.defenders.length > 3 ? ", …" : "")
            : "target";
        const kills = attackerAttack >= targetDefense;
        targetSeat = pending.defenderSeat as PlayerKey;
        summary = `Attacker ${attackerName}${effectText}${fsTag} vs ${targetName} @#${
          tileNo ?? "?"
        } → Expected: Atk ${attackerAttack} vs Def ${targetDefense} (${
          kills ? "likely kill" : "may fail"
        })`;
      }
    }

    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "combatResolve",
          id: pending.id,
          attacker: pending.attacker,
          defenders: pending.defenders,
          tile: pending.tile,
          target: pending.target ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        if (!haveSummary) {
          set({
            lastCombatSummary: {
              id: pending.id,
              text: summary,
              ts: Date.now(),
              actor: actorSeat,
              targetSeat,
            },
          } as Partial<GameState> as GameState);
          transport.sendMessage({
            type: "combatSummary",
            id: pending.id,
            text: summary,
            ts: Date.now(),
            actor: actorSeat,
            targetSeat,
          } as unknown as CustomMessage);
        }
      } catch (error) {
        console.error("[resolveCombat] Error sending combatResolve:", error);
      }
    }
    set({
      pendingCombat: null,
      attackChoice: null,
      attackTargetChoice: null,
      attackConfirm: null,
    } as Partial<GameState> as GameState);
  },

  autoResolveCombat: () => {
    const pending = get().pendingCombat;
    if (!pending) return;
    if (pending.status !== "committed") return;
    const actor = get().actorKey as PlayerKey | null;
    const isIntercept = !pending.target;
    const attackerSeat = seatFromOwner(pending.attacker.owner);
    const defenderSeat = pending.defenderSeat as PlayerKey | null;
    if (actor) {
      const defenderMayResolve = Boolean(
        isIntercept && defenderSeat && actor === defenderSeat
      );
      if (!defenderMayResolve && actor !== attackerSeat) return;
    }
    const { permanents, metaByCardId, board, players } = get();

    function getAtkDef(
      at: string,
      index: number
    ): { atk: number; def: number } {
      try {
        const cardId =
          (permanents as Permanents)[at]?.[index]?.card?.cardId ?? null;
        const meta = cardId
          ? (
              metaByCardId as Record<
                number,
                { attack: number | null; defence: number | null }
              >
            )[Number(cardId)]
          : undefined;
        const atk = Number(meta?.attack ?? 0) || 0;
        const def = Number(meta?.defence ?? meta?.attack ?? 0) || 0;
        return { atk, def };
      } catch {
        return { atk: 0, def: 0 };
      }
    }

    function getAttachments(at: string, index: number): Permanents[string] {
      const list = (permanents as Permanents)[at] || [];
      return list.filter(
        (p) =>
          p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index
      );
    }

    function computeEffectiveAttack(input: { at: CellKey; index: number }): {
      atk: number;
      firstStrike: boolean;
    } {
      const base = getAtkDef(input.at, input.index).atk;
      const attachments = getAttachments(input.at, input.index);
      let atk = base;
      let firstStrike = false;
      let disabled = false;
      for (const token of attachments) {
        const name = (token.card?.name || "").toLowerCase();
        if (name === "lance") {
          firstStrike = true;
          atk += 1;
        }
        if (name === "disabled") {
          disabled = true;
        }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }

    const eff = computeEffectiveAttack({
      at: pending.attacker.at,
      index: pending.attacker.index,
    });

    // Helper to get instanceId from a permanent at a given position
    function getInstanceId(at: CellKey, index: number): string | null {
      try {
        return (permanents as Permanents)[at]?.[index]?.instanceId ?? null;
      } catch {
        return null;
      }
    }

    let targetSeat: PlayerKey | undefined;
    const killList: Array<{
      at: CellKey;
      index: number;
      owner: PlayerKey;
      instanceId: string | null;
    }> = [];
    const damageList: Array<{ at: CellKey; index: number; amount: number }> =
      [];
    let defenders = (pending.defenders || []).map((defender) => {
      const stats = getAtkDef(defender.at, defender.index);
      const effective = computeEffectiveAttack({
        at: defender.at,
        index: defender.index,
      });
      return {
        ...defender,
        def: stats.def,
        atk: effective.atk,
        fs: effective.firstStrike,
      };
    });

    if (
      defenders.length === 0 &&
      pending.target &&
      pending.target.kind === "permanent" &&
      pending.target.index != null
    ) {
      const owner = (() => {
        try {
          return (permanents as Permanents)[pending.target.at]?.[
            pending.target.index
          ]?.owner as 1 | 2 | undefined;
        } catch {
          return undefined;
        }
      })();
      if (owner === 1 || owner === 2) {
        const stats = getAtkDef(pending.target.at, pending.target.index);
        const effective = computeEffectiveAttack({
          at: pending.target.at,
          index: pending.target.index,
        });
        defenders = [
          {
            at: pending.target.at,
            index: Number(pending.target.index),
            owner,
            def: stats.def,
            atk: effective.atk,
            fs: effective.firstStrike,
          },
        ];
      }
    }

    const defenderAssignment = new Map<string, number>();
    if (defenders.length > 1) {
      const assignment = pending.assignment || [];
      let total = 0;
      for (const item of assignment) {
        const key = `${item.at}:${item.index}`;
        defenderAssignment.set(key, Math.floor(Number(item.amount) || 0));
        total += Math.floor(Number(item.amount) || 0);
      }
      if (total !== Math.floor(eff.atk)) {
        const actorSeatCurrent = actor as PlayerKey | null;
        const defenderResolving = Boolean(
          isIntercept &&
            actorSeatCurrent &&
            defenderSeat &&
            actorSeatCurrent === defenderSeat
        );
        if (defenderResolving) {
          const max = Math.floor(eff.atk);
          const count = defenders.length;
          const base = Math.floor(max / count);
          let remainder = max - base * count;
          for (const defender of defenders) {
            const key = `${defender.at}:${defender.index}`;
            const amount = base + (remainder > 0 ? 1 : 0);
            defenderAssignment.set(key, amount);
            if (remainder > 0) remainder -= 1;
          }
        } else {
          return;
        }
      }
    } else if (defenders.length === 1) {
      const only = defenders[0];
      defenderAssignment.set(`${only.at}:${only.index}`, Math.floor(eff.atk));
    }

    const attackerDef = getAtkDef(
      pending.attacker.at,
      pending.attacker.index
    ).def;
    let attackerAlive = true;
    const aliveDefenders = new Set(
      defenders.map((defender) => `${defender.at}:${defender.index}`)
    );

    if (eff.firstStrike || defenders.some((defender) => defender.fs)) {
      if (eff.firstStrike && defenders.length > 0) {
        for (const defender of defenders) {
          const key = `${defender.at}:${defender.index}`;
          const assigned = defenderAssignment.get(key) || 0;
          if (assigned >= defender.def) {
            killList.push({
              at: defender.at,
              index: defender.index,
              owner: seatFromOwner(defender.owner),
              instanceId: getInstanceId(defender.at, defender.index),
            });
            aliveDefenders.delete(key);
          } else if (assigned > 0) {
            damageList.push({
              at: defender.at,
              index: defender.index,
              amount: assigned,
            });
          }
        }
        targetSeat = pending.defenderSeat as PlayerKey;
      }
      const fsAttackFromDefenders = defenders
        .filter(
          (defender) =>
            defender.fs &&
            aliveDefenders.has(`${defender.at}:${defender.index}`)
        )
        .reduce((sum, defender) => sum + defender.atk, 0);
      if (fsAttackFromDefenders >= attackerDef && attackerDef > 0) {
        attackerAlive = false;
      }
    }

    if (attackerAlive) {
      for (const defender of defenders) {
        const key = `${defender.at}:${defender.index}`;
        if (!aliveDefenders.has(key)) continue;
        const assigned = defenderAssignment.get(key) || 0;
        if (assigned >= defender.def) {
          killList.push({
            at: defender.at,
            index: defender.index,
            owner: seatFromOwner(defender.owner),
            instanceId: getInstanceId(defender.at, defender.index),
          });
          aliveDefenders.delete(key);
        } else if (assigned > 0) {
          damageList.push({
            at: defender.at,
            index: defender.index,
            amount: assigned,
          });
        }
      }
      targetSeat = pending.defenderSeat as PlayerKey;
    }

    if (attackerAlive) {
      const anyFirstStrike =
        eff.firstStrike || defenders.some((defender) => defender.fs);
      let defenderAtkSum = 0;
      if (anyFirstStrike) {
        const nonFsAlive = defenders.filter(
          (defender) =>
            !defender.fs &&
            aliveDefenders.has(`${defender.at}:${defender.index}`)
        );
        defenderAtkSum = nonFsAlive.reduce(
          (sum, defender) => sum + defender.atk,
          0
        );
      } else {
        defenderAtkSum = defenders.reduce(
          (sum, defender) => sum + defender.atk,
          0
        );
      }
      if (defenderAtkSum >= attackerDef && attackerDef > 0) {
        attackerAlive = false;
      }
    }

    if (!attackerAlive) {
      killList.push({
        at: pending.attacker.at,
        index: pending.attacker.index,
        owner: attackerSeat,
        instanceId: getInstanceId(pending.attacker.at, pending.attacker.index),
      });
    }

    for (const dmg of damageList) {
      try {
        get().applyDamageToPermanent(dmg.at, dmg.index, dmg.amount);
      } catch {
        // ignore
      }
    }

    if (defenders.length === 0) {
      if (pending.target && pending.target.kind === "site") {
        const owner = board.sites[pending.target.at]?.owner as
          | 1
          | 2
          | undefined;
        if (owner === 1 || owner === 2) {
          const seat = seatFromOwner(owner);
          targetSeat = seat;
          const dd = players[seat].lifeState === "dd";
          if (!dd) {
            const dmg = Math.max(0, Math.floor(eff.atk));
            if (dmg > 0) {
              try {
                get().addLife(seat as PlayerKey, -dmg);
              } catch {
                // ignore
              }
            }
          }
        }
      } else if (pending.target && pending.target.kind === "avatar") {
        const seat = opponentSeat(attackerSeat);
        targetSeat = seat;
        const isDD = players[seat].lifeState === "dd";
        const dmg = Math.max(0, Math.floor(eff.atk));
        if (isDD) {
          try {
            get().addLife(seat, -1);
          } catch {
            // ignore
          }
        } else if (dmg > 0) {
          try {
            get().addLife(seat, -dmg);
          } catch {
            // ignore
          }
        }
      }
    }

    // Helper to find current index of a permanent by instanceId
    function findIndexByInstanceId(
      at: CellKey,
      instanceId: string | null
    ): number {
      if (!instanceId) return -1;
      const list = (get().permanents as Permanents)[at] || [];
      return list.findIndex((p) => p.instanceId === instanceId);
    }

    const mySeat = get().actorKey as PlayerKey | null;

    // Sort kills by index descending within each cell to avoid index shifting issues
    // When removing items, higher indices should be removed first
    const myKills = killList
      .filter((k) => !mySeat || k.owner === mySeat)
      .sort((a, b) => {
        if (a.at !== b.at) return 0; // Only sort within same cell
        return b.index - a.index; // Descending order
      });

    for (const kill of myKills) {
      try {
        // Prefer instanceId lookup to handle index drift from concurrent patches
        let currentIndex = kill.index;
        if (kill.instanceId) {
          const found = findIndexByInstanceId(kill.at, kill.instanceId);
          if (found >= 0) {
            currentIndex = found;
          } else {
            console.warn(
              "[autoResolveCombat] Permanent not found by instanceId, using original index:",
              kill
            );
          }
        }
        get().movePermanentToZone(kill.at, currentIndex, "graveyard");
      } catch (error) {
        console.error("[autoResolveCombat] Error moving to graveyard:", error);
      }
    }

    const transport = get().transport;
    if (transport?.sendMessage && killList.length > 0) {
      try {
        transport.sendMessage({
          type: "combatAutoApply",
          id: pending.id,
          kills: killList,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch (error) {
        console.error(
          "[autoResolveCombat] Error sending combatAutoApply:",
          error
        );
      }
    }
    if (transport?.sendMessage && damageList.length > 0) {
      try {
        transport.sendMessage({
          type: "combatDamage",
          id: pending.id,
          damage: damageList,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        // ignore
      }
    }

    const attackerName = (() => {
      try {
        return (
          (get().permanents as Permanents)[pending.attacker.at]?.[
            pending.attacker.index
          ]?.card?.name || "Attacker"
        );
      } catch {
        return "Attacker";
      }
    })();

    const getNameAt = (at: CellKey, index: number): string => {
      try {
        return (
          (get().permanents as Permanents)[at]?.[index]?.card?.name || "Unit"
        );
      } catch {
        return "Unit";
      }
    };

    const deadDefenders = killList
      .filter((kill) => kill.owner === (pending.defenderSeat as PlayerKey))
      .map((kill) => {
        try {
          return (get().permanents as Permanents)[kill.at]?.[kill.index]?.card
            ?.name;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    const attackerDied = killList.some(
      (kill) =>
        kill.at === pending.attacker.at && kill.index === pending.attacker.index
    );

    let damageFromFirstStrike = 0;
    let damageFromSimultaneous = 0;
    try {
      const anyFirstStrike =
        eff.firstStrike || defenders.some((defender) => defender.fs);
      const fsContrib = defenders
        .filter(
          (defender) =>
            defender.fs &&
            aliveDefenders.has(`${defender.at}:${defender.index}`)
        )
        .reduce((sum, defender) => sum + defender.atk, 0);
      damageFromFirstStrike = fsContrib;
      if (anyFirstStrike) {
        if (attackerAlive) {
          const nonFsAlive = defenders
            .filter(
              (defender) =>
                !defender.fs &&
                aliveDefenders.has(`${defender.at}:${defender.index}`)
            )
            .reduce((sum, defender) => sum + defender.atk, 0);
          damageFromSimultaneous = nonFsAlive;
        }
      } else {
        damageFromSimultaneous = defenders.reduce(
          (sum, defender) => sum + defender.atk,
          0
        );
      }
    } catch {
      // ignore
    }

    const totalDamageToAttacker = Math.max(
      0,
      Math.floor(damageFromFirstStrike + damageFromSimultaneous)
    );
    let text = "";
    if ((pending.defenders?.length || 0) > 0) {
      const defenderNames = (pending.defenders || []).map((defender) =>
        getNameAt(defender.at, defender.index)
      );
      if (attackerDied) {
        const source =
          defenderNames.length === 1
            ? `defending "${defenderNames[0]}"`
            : `defenders ${defenderNames.map((n) => `"${n}"`).join(", ")}`;
        text = `Attacker "${attackerName}" takes ${totalDamageToAttacker} damage from ${source} and is destroyed`;
        if (deadDefenders.length > 0) {
          text += `; defenders lost: ${deadDefenders.join(", ")}`;
        }
      } else if (deadDefenders.length > 0) {
        text = `Defenders destroyed: ${deadDefenders.join(", ")}`;
      } else {
        const damageDescriptions = damageList.map((damage) => {
          const name = getNameAt(damage.at as CellKey, damage.index);
          return `${name}: ${damage.amount}`;
        });
        text = damageDescriptions.length
          ? `Damage dealt to defenders: ${damageDescriptions.join(", ")}`
          : "No casualties";
      }
    } else if (pending.target && pending.target.kind === "avatar") {
      const seat: PlayerKey = opponentSeat(attackerSeat);
      const before = Number((players as GameState["players"])[seat]?.life ?? 0);
      const after = Number(
        (get().players as GameState["players"])[seat]?.life ?? before
      );
      const dmg = Math.max(0, before - after);
      const avatarName = (() => {
        try {
          return (get().avatars?.[seat]?.card?.name as string) || "Avatar";
        } catch {
          return "Avatar";
        }
      })();
      if (before > 0 && after === 0) {
        text = `Attacker "${attackerName}" strikes Avatar "${avatarName}" for lethal damage (reaches Death's Door)`;
      } else {
        text = `Attacker "${attackerName}" strikes Avatar "${avatarName}" for ${dmg} damage (${seat.toUpperCase()} life ${before} -> ${after})`;
      }
    } else if (pending.target && pending.target.kind === "site") {
      const owner = get().board.sites[pending.target.at]?.owner as
        | 1
        | 2
        | undefined;
      const seat: PlayerKey | null =
        owner === 1 || owner === 2 ? seatFromOwner(owner) : null;
      const siteName = (() => {
        try {
          return (
            get().board.sites[pending.target.at as CellKey]?.card?.name ||
            "Site"
          );
        } catch {
          return "Site";
        }
      })();
      if (seat) {
        const before = Number(
          (players as GameState["players"])[seat]?.life ?? 0
        );
        const after = Number(
          (get().players as GameState["players"])[seat]?.life ?? before
        );
        const dmg = Math.max(0, before - after);
        text = `Attacker "${attackerName}" strikes Site "${siteName}" for ${dmg} damage (${seat.toUpperCase()} life ${before} -> ${after})`;
      } else {
        text = `Attacker "${attackerName}" strikes Site "${siteName}"`;
      }
    } else {
      text = attackerDied
        ? `Attacker "${attackerName}" is destroyed`
        : "No casualties";
    }

    set({
      lastCombatSummary: {
        id: pending.id,
        text,
        ts: Date.now(),
        actor: attackerSeat,
        targetSeat,
      },
    } as Partial<GameState> as GameState);
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "combatSummary",
          id: pending.id,
          text,
          ts: Date.now(),
          actor: attackerSeat,
          targetSeat,
        } as unknown as CustomMessage);
      } catch (error) {
        console.error(
          "[autoResolveCombat] Error sending combatSummary:",
          error
        );
      }
    }

    get().resolveCombat();
  },

  cancelCombat: () => {
    const pending = get().pendingCombat;
    if (!pending) return;
    set({ pendingCombat: null } as Partial<GameState> as GameState);
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "combatCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch (error) {
        console.error("[cancelCombat] Error sending combatCancel:", error);
      }
    }
  },
});
