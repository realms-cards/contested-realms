import type { StateCreator } from "zustand";
import type {
  InteractionEnvelope,
  InteractionMessage,
  InteractionResultMessage,
  InteractionDecision,
  InteractionGrantRequest,
} from "@/lib/net/interactions";
import {
  wrapInteractionMessage,
  grantFromRequest,
  generateInteractionRequestId,
  createInteractionRequest,
  createInteractionResponse,
} from "@/lib/net/interactions";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  GameState,
  InteractionRequestEntry,
  InteractionStateMap,
  PlayerKey,
  SendInteractionRequestInput,
  InteractionResponseOptions,
} from "./types";

type InteractionSlice = Pick<
  GameState,
  | "interactionLog"
  | "pendingInteractionId"
  | "acknowledgedInteractionIds"
  | "activeInteraction"
  | "sendInteractionRequest"
  | "receiveInteractionEnvelope"
  | "receiveInteractionResult"
  | "respondToInteraction"
  | "expireInteraction"
  | "clearInteraction"
>;

export const normalizeGrantRequest = (
  candidate: unknown
): InteractionGrantRequest | null => {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Record<string, unknown>;
  const normalized: InteractionGrantRequest = {};
  if ("targetSeat" in src) {
    const seat = src.targetSeat;
    if (seat === "p1" || seat === "p2" || seat === null) {
      normalized.targetSeat = seat;
    }
  }
  if (typeof src.expiresAt === "number" && Number.isFinite(src.expiresAt)) {
    normalized.expiresAt = src.expiresAt;
  }
  if (typeof src.singleUse === "boolean") {
    normalized.singleUse = src.singleUse;
  }
  if (typeof src.allowOpponentZoneWrite === "boolean") {
    normalized.allowOpponentZoneWrite = src.allowOpponentZoneWrite;
  }
  if (typeof src.allowRevealOpponentHand === "boolean") {
    normalized.allowRevealOpponentHand = src.allowRevealOpponentHand;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
};

export const pickNextPendingInteraction = (
  log: InteractionStateMap
): InteractionRequestEntry | null => {
  let selected: InteractionRequestEntry | null = null;
  for (const entry of Object.values(log)) {
    if (!entry || entry.status !== "pending") continue;
    if (!selected) {
      selected = entry;
      continue;
    }
    if (selected.direction === "outbound" && entry.direction === "inbound") {
      selected = entry;
      continue;
    }
    if (
      entry.direction === selected.direction &&
      entry.receivedAt < selected.receivedAt
    ) {
      selected = entry;
    }
  }
  return selected;
};

export const computeInteractionFocus = (
  log: InteractionStateMap
): {
  active: InteractionRequestEntry | null;
  pendingId: string | null;
} => {
  const next = pickNextPendingInteraction(log);
  return { active: next, pendingId: next ? next.request.requestId : null };
};

export const createInteractionSlice: StateCreator<
  GameState,
  [],
  [],
  InteractionSlice
> = (set, get) => ({
  interactionLog: {},
  pendingInteractionId: null,
  acknowledgedInteractionIds: {},
  activeInteraction: null,

  sendInteractionRequest: (input: SendInteractionRequestInput) => {
    const requestId = input.requestId ?? generateInteractionRequestId();
    const grantOverride = normalizeGrantRequest(input.grant);
    const basePayload = { ...(input.payload ?? {}) } as Record<string, unknown>;
    if (grantOverride) {
      basePayload.grant = grantOverride;
    }
    const request = createInteractionRequest({
      requestId,
      from: input.from,
      to: input.to,
      kind: input.kind,
      matchId: input.matchId,
      note: input.note,
      payload: Object.keys(basePayload).length > 0 ? basePayload : undefined,
    });
    set((state) => {
      const existing = state.interactionLog[requestId];
      const nextEntry: InteractionRequestEntry = {
        request,
        response: existing?.response,
        status: "pending",
        direction: existing?.direction ?? "outbound",
        grant: existing?.grant ?? null,
        proposedGrant: grantOverride ?? existing?.proposedGrant ?? null,
        receivedAt: existing?.receivedAt ?? request.createdAt,
        updatedAt: request.createdAt,
      };
      const nextLog: InteractionStateMap = {
        ...state.interactionLog,
        [requestId]: nextEntry,
      };
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
      };
    });
    const transport = get().transport;
    const envelope = wrapInteractionMessage(request);
    try {
      let maybe: unknown = undefined;
      if (transport?.sendInteractionRequest) {
        maybe = transport.sendInteractionRequest(request);
      } else if (transport?.sendInteractionEnvelope) {
        maybe = transport.sendInteractionEnvelope(envelope);
      } else if (transport?.sendMessage) {
        maybe = transport.sendMessage(envelope as unknown as CustomMessage);
      } else if (!transport) {
        try {
          console.warn(
            "[interaction] transport unavailable; request queued in log",
            requestId
          );
        } catch {}
      } else {
        try {
          console.warn(
            "[interaction] transport missing interaction senders; request not sent",
            requestId
          );
        } catch {}
      }
      if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
        (maybe as Promise<unknown>).catch((err) => {
          try {
            console.warn("[interaction] send request rejected", err);
          } catch {}
        });
      }
    } catch (err) {
      try {
        console.warn("[interaction] failed to send request", err);
      } catch {}
    }
  },

  receiveInteractionEnvelope: (
    incoming: InteractionEnvelope | InteractionMessage
  ) => {
    const message: InteractionMessage | null = (() => {
      if (!incoming || typeof incoming !== "object") return null;
      if (
        (incoming as InteractionEnvelope).type === "interaction" &&
        "message" in incoming
      ) {
        return (incoming as InteractionEnvelope).message;
      }
      if (
        (incoming as Partial<InteractionMessage>).type ===
          "interaction:request" ||
        (incoming as Partial<InteractionMessage>).type ===
          "interaction:response"
      ) {
        return incoming as InteractionMessage;
      }
      return null;
    })();
    if (!message) return;
    const now = Date.now();
    if (message.type === "interaction:request") {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const proposedGrant =
        normalizeGrantRequest(payload.grant) ??
        normalizeGrantRequest(payload.proposedGrant);
      set((state) => {
        const existing = state.interactionLog[message.requestId];
        const nextEntry: InteractionRequestEntry = {
          request: message,
          response: existing?.response,
          status: existing?.status ?? "pending",
          direction: existing?.direction ?? "inbound",
          grant: existing?.grant ?? null,
          proposedGrant: proposedGrant ?? existing?.proposedGrant ?? null,
          receivedAt: existing?.receivedAt ?? message.createdAt ?? now,
          updatedAt: now,
        };
        const nextLog: InteractionStateMap = {
          ...state.interactionLog,
          [message.requestId]: nextEntry,
        };
        const focus = computeInteractionFocus(nextLog);
        return {
          interactionLog: nextLog,
          pendingInteractionId: focus.pendingId,
          activeInteraction: focus.active,
        };
      });
      return;
    }
    if (message.type === "interaction:response") {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const grantOverride =
        normalizeGrantRequest(payload.grant) ??
        normalizeGrantRequest(payload.proposedGrant);
      const localId = get().localPlayerId;
      let shouldLogDecision = false;
      let decisionLogText: string | null = null;
      set((state) => {
        const existing = state.interactionLog[message.requestId];
        const baseRequest =
          existing?.request ??
          createInteractionRequest({
            requestId: message.requestId,
            matchId: message.matchId,
            from: message.to,
            to: message.from,
            kind: message.kind,
            createdAt: message.createdAt,
            expiresAt: message.expiresAt,
          });
        const nextGrant =
          message.decision === "approved"
            ? grantFromRequest(
                baseRequest,
                message.from,
                grantOverride ?? existing?.proposedGrant ?? {}
              )
            : null;
        const nextEntry: InteractionRequestEntry = {
          request: baseRequest,
          response: message,
          status: message.decision,
          direction: existing?.direction ?? "outbound",
          grant: nextGrant,
          proposedGrant: grantOverride ?? existing?.proposedGrant ?? null,
          receivedAt: existing?.receivedAt ?? baseRequest.createdAt ?? now,
          updatedAt: now,
        };
        const wasAlreadyAnswered = !!existing?.response;
        const isRequester = !!localId && baseRequest.from === localId;
        if (!wasAlreadyAnswered && isRequester) {
          const kindLabel = String(message.kind || "request");
          if (message.decision === "approved") {
            decisionLogText = `Consent result: '${kindLabel}' approved.`;
            shouldLogDecision = true;
          } else if (message.decision === "declined") {
            const reason =
              typeof message.reason === "string" && message.reason.trim().length
                ? `: ${message.reason}`
                : ".";
            decisionLogText = `Consent result: '${kindLabel}' declined${reason}`;
            shouldLogDecision = true;
          } else if (message.decision === "cancelled") {
            const reason =
              typeof message.reason === "string" && message.reason.trim().length
                ? `: ${message.reason}`
                : ".";
            decisionLogText = `Consent result: '${kindLabel}' cancelled${reason}`;
            shouldLogDecision = true;
          }
        }
        const nextLog: InteractionStateMap = {
          ...state.interactionLog,
          [message.requestId]: nextEntry,
        };
        const focus = computeInteractionFocus(nextLog);
        const acknowledged = {
          ...state.acknowledgedInteractionIds,
          [message.requestId]: true as const,
        };
        return {
          interactionLog: nextLog,
          pendingInteractionId: focus.pendingId,
          activeInteraction: focus.active,
          acknowledgedInteractionIds: acknowledged,
        };
      });
      if (shouldLogDecision && decisionLogText) {
        try {
          get().log(decisionLogText);
        } catch {}
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: decisionLogText },
              })
            );
          }
        } catch {}
      }
    }
  },

  respondToInteraction: (
    requestId,
    decision: InteractionDecision,
    actorId,
    options?: InteractionResponseOptions
  ) => {
    const now = Date.now();
    const state = get();
    const entry = state.interactionLog[requestId];
    if (!entry) return;
    const request = entry.request;
    const grantOverride = normalizeGrantRequest(options?.grant);
    // Build payload with grant inside (Zod schema strips top-level grant)
    const basePayload =
      options?.payload && typeof options.payload === "object"
        ? { ...options.payload }
        : {};
    if (grantOverride) {
      basePayload.grant = grantOverride;
    }
    const payload =
      Object.keys(basePayload).length > 0 ? basePayload : undefined;
    const response = createInteractionResponse({
      requestId,
      decision,
      actorId,
      reason: options?.reason,
      payload,
      matchId: request.matchId,
      from: request.to,
      to: request.from,
      kind: request.kind,
      createdAt: now,
      respondedAt: now,
    } as Parameters<typeof createInteractionResponse>[0]);
    set((current) => {
      const existing = current.interactionLog[requestId];
      if (!existing) return current as GameState;
      const nextEntry: InteractionRequestEntry = {
        ...existing,
        response,
        status: decision,
        updatedAt: now,
        proposedGrant: grantOverride ?? existing.proposedGrant ?? null,
      };
      const nextLog: InteractionStateMap = {
        ...current.interactionLog,
        [requestId]: nextEntry,
      };
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
      } as Partial<GameState> as GameState;
    });
    const envelope = wrapInteractionMessage(response);
    const transport = get().transport;
    try {
      let maybe: unknown = undefined;
      if (transport?.sendInteractionResponse) {
        maybe = transport.sendInteractionResponse(response);
      } else if (transport?.sendInteractionEnvelope) {
        maybe = transport.sendInteractionEnvelope(envelope);
      } else if (transport?.sendMessage) {
        maybe = transport.sendMessage(envelope as unknown as CustomMessage);
      } else if (!transport) {
        try {
          console.warn(
            "[interaction] transport unavailable; response logged only",
            requestId
          );
        } catch {}
      } else {
        try {
          console.warn(
            "[interaction] transport missing interaction senders; response not sent",
            requestId
          );
        } catch {}
      }
      if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
        (maybe as Promise<unknown>).catch((err) => {
          try {
            console.warn("[interaction] response send rejected", err);
          } catch {}
        });
      }
    } catch (err) {
      try {
        console.warn("[interaction] failed to send response", err);
      } catch {}
    }
  },

  receiveInteractionResult: (message: InteractionResultMessage) => {
    const now = Date.now();
    set((state) => {
      const existing = state.interactionLog[message.requestId];
      const nextEntry: InteractionRequestEntry | undefined = existing
        ? { ...existing, result: message, updatedAt: now }
        : undefined;
      const nextLog: InteractionStateMap = nextEntry
        ? { ...state.interactionLog, [message.requestId]: nextEntry }
        : { ...state.interactionLog };
      const acknowledged = {
        ...state.acknowledgedInteractionIds,
        [message.requestId]: true as const,
      };

      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const requestedBy =
        typeof payload.requestedBy === "string" &&
        payload.requestedBy.length > 0
          ? payload.requestedBy
          : null;
      const actorSeat =
        payload.actorSeat === "p1" || payload.actorSeat === "p2"
          ? (payload.actorSeat as PlayerKey)
          : null;
      // Build source info if available (for pile/hand peeks with follow-up actions)
      const source =
        (payload.seat === "p1" || payload.seat === "p2") &&
        (payload.pile === "spellbook" ||
          payload.pile === "atlas" ||
          payload.pile === "hand") &&
        (payload.from === "top" || payload.from === "bottom")
          ? {
              seat: payload.seat as PlayerKey,
              pile: payload.pile as "spellbook" | "atlas" | "hand",
              from: payload.from as "top" | "bottom",
            }
          : undefined;

      if (
        requestedBy &&
        get().localPlayerId &&
        requestedBy === get().localPlayerId &&
        Array.isArray(payload.cards)
      ) {
        try {
          get().openPeekDialog(
            typeof payload.title === "string" ? payload.title : "Peek",
            payload.cards as CardRef[],
            source
          );
        } catch {}
      } else if (!get().transport && actorSeat === get().actorKey) {
        if (Array.isArray(payload.cards)) {
          try {
            get().openPeekDialog(
              typeof payload.title === "string" ? payload.title : "Peek",
              payload.cards as CardRef[],
              source
            );
          } catch {}
        }
      }

      return {
        interactionLog: nextLog,
        acknowledgedInteractionIds: acknowledged,
      } as Partial<GameState> as GameState;
    });
  },

  expireInteraction: (requestId: string) => {
    const now = Date.now();
    set((state) => {
      const entry = state.interactionLog[requestId];
      if (!entry) return state as GameState;
      const nextEntry: InteractionRequestEntry = {
        ...entry,
        status: "expired",
        updatedAt: now,
      };
      const nextLog: InteractionStateMap = {
        ...state.interactionLog,
        [requestId]: nextEntry,
      };
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
      } as Partial<GameState> as GameState;
    });
  },

  clearInteraction: (requestId: string) =>
    set((state) => {
      if (!(requestId in state.interactionLog)) return state as GameState;
      const nextLog: InteractionStateMap = { ...state.interactionLog };
      delete nextLog[requestId];
      const nextAck = { ...state.acknowledgedInteractionIds };
      delete nextAck[requestId];
      const focus = computeInteractionFocus(nextLog);
      return {
        interactionLog: nextLog,
        pendingInteractionId: focus.pendingId,
        activeInteraction: focus.active,
        acknowledgedInteractionIds: nextAck,
      } as Partial<GameState> as GameState;
    }),
});
