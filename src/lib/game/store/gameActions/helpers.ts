import type { GameState, InteractionRequestEntry, PlayerKey } from "../types";

export type InstantPermission = {
  allow: boolean;
  consumeId: string | null;
};

export function evaluateInstantPermission(
  state: GameState,
  who: PlayerKey
): InstantPermission {
  if (!state.transport) return { allow: false, consumeId: null };
  const myId = state.localPlayerId;
  for (const [rid, rawEntry] of Object.entries(state.interactionLog)) {
    const entry = rawEntry as InteractionRequestEntry | undefined;
    if (!entry || entry.status !== "approved") continue;
    if (entry.request.kind !== "instantSpell") continue;
    const grant = entry.grant;
    if (!grant) continue;
    const isMe = myId ? grant.grantedTo === myId : entry.direction === "outbound";
    if (!isMe) continue;
    const exp = typeof grant.expiresAt === "number" ? grant.expiresAt : null;
    if (exp !== null && exp <= Date.now()) continue;
    const consumeId = grant.singleUse ? rid : null;
    return { allow: true, consumeId };
  }
  return { allow: false, consumeId: null };
}

export function expireInteractionGrant(
  state: GameState,
  consumeId: string | null
): GameState["interactionLog"] | null {
  if (!consumeId) return null;
  const current = state.interactionLog as GameState["interactionLog"];
  const entry = current?.[consumeId];
  if (!entry) return null;
  return {
    ...current,
    [consumeId]: {
      ...entry,
      status: "expired",
      updatedAt: Date.now(),
    },
  } as GameState["interactionLog"];
}
