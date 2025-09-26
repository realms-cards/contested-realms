import { z } from "zod";

export const InteractionRequestKinds = [
  "instantSpell",
  "defend",
  "forcedDraw",
  "inspectHand",
  "takeFromPile",
  "manipulatePermanent",
] as const;

export type InteractionRequestKind =
  typeof InteractionRequestKinds[number];

export const InteractionDecisionSchema = z.enum([
  "approved",
  "declined",
  "cancelled",
]);

export type InteractionDecision = z.infer<typeof InteractionDecisionSchema>;

export const InteractionBaseSchema = z.object({
  requestId: z.string().min(6),
  matchId: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(InteractionRequestKinds),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive().optional(),
});

export const InteractionRequestMessageSchema = InteractionBaseSchema.extend({
  type: z.literal("interaction:request"),
  note: z.string().max(280).optional(),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Opaque metadata contextualising the request"),
});

export type InteractionRequestMessage = z.infer<
  typeof InteractionRequestMessageSchema
>;

export const InteractionResponseMessageSchema = InteractionBaseSchema.extend({
  type: z.literal("interaction:response"),
  decision: InteractionDecisionSchema,
  respondedAt: z.number().int().nonnegative(),
  reason: z.string().max(280).optional(),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional metadata such as grants issued with the response"),
});

export type InteractionResponseMessage = z.infer<
  typeof InteractionResponseMessageSchema
>;

export const InteractionMessageSchema = z.discriminatedUnion("type", [
  InteractionRequestMessageSchema,
  InteractionResponseMessageSchema,
]);

export type InteractionMessage = z.infer<typeof InteractionMessageSchema>;

export const INTERACTION_VERSION = 1;

export const InteractionEnvelopeSchema = z.object({
  type: z.literal("interaction"),
  version: z.number().int().min(1).default(INTERACTION_VERSION),
  message: InteractionMessageSchema,
});

export type InteractionEnvelope = z.infer<typeof InteractionEnvelopeSchema>;

// Lightweight result envelope emitted by the server once an approved
// interaction has been executed authoritatively. This is intentionally
// not part of the InteractionMessage discriminated union used for
// request/response, as it may carry arbitrary payloads depending on the
// kind (e.g., revealed cards for peek/inspect, metadata for toolbox actions).
export type InteractionResultMessage = {
  requestId: string;
  matchId?: string;
  from?: string;
  to?: string;
  // Prefer the canonical kind when known; server may return a custom string
  kind?: (typeof InteractionRequestKinds)[number] | string;
  // Whether the requested action succeeded (e.g., approved and executed)
  success: boolean;
  // Opaque payload; common fields used by the client (cards, seat, pile, count, from, message)
  payload?: Record<string, unknown>;
  // Optional short message suitable for console log
  message?: string;
  // Server timestamp when produced
  t?: number;
};

export type InteractionGrantRequest = {
  targetSeat?: "p1" | "p2" | null;
  expiresAt?: number;
  singleUse?: boolean;
  allowOpponentZoneWrite?: boolean;
  allowRevealOpponentHand?: boolean;
};

export type InteractionGrant = {
  requestId: string;
  kind: InteractionRequestKind;
  grantedBy: string;
  grantedTo: string;
  targetSeat: "p1" | "p2" | null;
  createdAt: number;
  expiresAt?: number;
  singleUse?: boolean;
  allowOpponentZoneWrite?: boolean;
  allowRevealOpponentHand?: boolean;
};

export function generateInteractionRequestId(prefix = "intl"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

export function grantFromRequest(
  request: InteractionRequestMessage,
  grantedBy: string,
  overrides: InteractionGrantRequest = {}
): InteractionGrant {
  const targetSeat =
    typeof overrides.targetSeat !== "undefined"
      ? overrides.targetSeat
      : null;
  return {
    requestId: request.requestId,
    kind: request.kind,
    grantedBy,
    grantedTo: request.from,
    targetSeat,
    createdAt: Date.now(),
    expiresAt: overrides.expiresAt,
    singleUse: overrides.singleUse,
    allowOpponentZoneWrite: overrides.allowOpponentZoneWrite,
    allowRevealOpponentHand: overrides.allowRevealOpponentHand,
  };
}

export function createInteractionRequest(
  init: Omit<InteractionRequestMessage, "type" | "createdAt"> & {
    createdAt?: number;
  }
): InteractionRequestMessage {
  const seeded = {
    ...init,
    type: "interaction:request" as const,
    createdAt: init.createdAt ?? Date.now(),
  } satisfies InteractionRequestMessage;
  return InteractionRequestMessageSchema.parse(seeded);
}

export function createInteractionResponse(
  init: Omit<InteractionResponseMessage, "type"> & {
    respondedAt?: number;
  }
): InteractionResponseMessage {
  const seeded = {
    ...init,
    type: "interaction:response" as const,
    respondedAt: init.respondedAt ?? Date.now(),
  } satisfies InteractionResponseMessage;
  return InteractionResponseMessageSchema.parse(seeded);
}

export function wrapInteractionMessage(
  message: InteractionMessage,
  version = INTERACTION_VERSION
): InteractionEnvelope {
  return InteractionEnvelopeSchema.parse({
    type: "interaction",
    version,
    message,
  });
}
