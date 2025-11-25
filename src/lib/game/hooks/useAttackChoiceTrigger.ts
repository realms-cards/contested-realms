import type {
  BoardState,
  GameState,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";

type AttackChoiceTriggerOptions = {
  permanents: Permanents;
  avatars: GameState["avatars"];
  board: BoardState;
  metaByCardId: GameState["metaByCardId"];
  fetchCardMeta: GameState["fetchCardMeta"];
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  setAttackChoice: GameState["setAttackChoice"];
};

type AttackChoiceTriggerArgs = {
  fromKey: string;
  fromIndex: number;
  dropKey: string;
  tileX: number;
  tileY: number;
  newIndex: number;
};

/**
 * Shared utility to trigger attack choice UI after a cross-tile permanent move.
 * Returns true if attack choice was triggered, false otherwise.
 */
export function triggerAttackChoiceIfApplicable(
  options: AttackChoiceTriggerOptions,
  args: AttackChoiceTriggerArgs
): boolean {
  const {
    permanents,
    avatars,
    board,
    metaByCardId,
    fetchCardMeta,
    actorKey,
    currentPlayer,
    setAttackChoice,
  } = options;

  const { fromKey, fromIndex, dropKey, tileX, tileY, newIndex } = args;

  try {
    const moved = permanents[fromKey]?.[fromIndex];
    if (!moved) return false;

    const cardId = Number(moved.card?.cardId);
    if (Number.isFinite(cardId) && cardId > 0 && !metaByCardId[cardId]) {
      void fetchCardMeta([cardId]);
    }

    // Check if the moved permanent has attack power
    let hasBasePower = false;
    if (Number.isFinite(cardId) && cardId > 0) {
      const meta = metaByCardId[cardId];
      if (meta) {
        const atk = Number(meta.attack);
        hasBasePower = Number.isFinite(atk) && atk !== 0;
      } else {
        // Assume it might have power if meta isn't loaded yet
        hasBasePower = true;
      }
    }

    if (!hasBasePower) return false;

    const owner = moved.owner ?? 1;
    const enemyOwner: 1 | 2 = owner === 1 ? 2 : 1;

    // Check for valid targets on the destination tile
    let hasTarget = false;

    // Check for enemy permanents
    const list = permanents[dropKey] || [];
    hasTarget = list.some((p) => p && p.owner === enemyOwner);

    // Check for enemy avatar
    if (!hasTarget) {
      const enemySeat = enemyOwner === 1 ? "p1" : "p2";
      const av = avatars?.[enemySeat];
      if (av && Array.isArray(av.pos) && av.pos.length === 2) {
        hasTarget = av.pos[0] === tileX && av.pos[1] === tileY;
      }
    }

    // Check for enemy site
    if (!hasTarget) {
      const site = board.sites[dropKey];
      if (site && site.owner === enemyOwner) {
        hasTarget = true;
      }
    }

    if (!hasTarget) return false;

    // Check if it's the actor's turn and they own the piece
    const mine =
      (actorKey === "p1" && owner === 1) || (actorKey === "p2" && owner === 2);
    const actorIsActive =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2);

    if (mine && actorIsActive) {
      setAttackChoice({
        tile: { x: tileX, y: tileY },
        attacker: {
          at: dropKey,
          index: newIndex,
          instanceId: moved.instanceId ?? null,
          owner: owner as 1 | 2,
        },
        attackerName: moved.card?.name || null,
      });
      return true;
    }
  } catch {
    // Silently fail - attack choice is optional UX
  }

  return false;
}
