import type { StateCreator } from "zustand";
import { wrapInteractionMessage } from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type { GameState, PlayerKey, ServerPatchT, Zones } from "./types";
import { clonePatchForQueue } from "./utils/patchHelpers";

type TransportSlice = Pick<
  GameState,
  | "transport"
  | "setTransport"
  | "transportSubscriptions"
  | "pendingPatches"
  | "trySendPatch"
  | "trySendD20Patch"
  | "flushPendingPatches"
>;

const PATCH_SIGNATURE_TTL_MS = 7_000;
const MAX_SIGNATURE_MAP_SIZE = 100;
const MAX_ENTRIES_PER_SIGNATURE = 10;
const PATCH_SIGNATURE_FIELDS = [
  "permanents",
  "zones",
  "board",
  "avatars",
  "permanentPositions",
  "permanentAbilities",
  "sitePositions",
  "playerPositions",
  "resources",
] as const;
type TrackedPatchField = (typeof PATCH_SIGNATURE_FIELDS)[number];

type PatchSignatureEntry = {
  expiresAt: number;
  fields: TrackedPatchField[];
  payload: Record<string, string>;
};

const pendingPatchSignatures = new Map<string, PatchSignatureEntry[]>();
let getStateAccessor: (() => GameState) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Microtask batching: collect patches during a frame and send once
// ─────────────────────────────────────────────────────────────────────────────
let batchedPatch: ServerPatchT | null = null;
let batchFlushScheduled = false;
let batchFlushCallback: (() => void) | null = null;

/**
 * Merge two arrays of permanents by instanceId.
 * Items with the same instanceId are merged (later values win for each field).
 * New items are appended.
 */
const mergePermanentArrays = (
  baseArr: unknown[],
  incomingArr: unknown[]
): unknown[] => {
  const map = new Map<string, Record<string, unknown>>();
  const order: string[] = [];

  // Process base items first
  for (const item of baseArr) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.instanceId === "string" ? record.instanceId : null;
    if (id) {
      map.set(id, { ...record });
      order.push(id);
    }
  }

  // Merge incoming items
  for (const item of incomingArr) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.instanceId === "string" ? record.instanceId : null;
    if (id) {
      const existing = map.get(id);
      if (existing) {
        // Merge with existing
        for (const [k, v] of Object.entries(record)) {
          if (v !== undefined) existing[k] = v;
        }
      } else {
        // New item
        map.set(id, { ...record });
        order.push(id);
      }
    } else {
      // No instanceId - just append
      return [...baseArr, ...incomingArr.filter((i) => i !== item), item];
    }
  }

  return order
    .map((id) => map.get(id))
    .filter((item): item is Record<string, unknown> => item !== undefined);
};

/**
 * Deep merge two patches. Later values overwrite earlier ones.
 * Arrays are replaced, not concatenated (except events which are merged,
 * and permanents arrays which are merged by instanceId).
 */
const mergePatch = (
  base: ServerPatchT | null,
  incoming: ServerPatchT
): ServerPatchT => {
  if (!base) return { ...incoming };
  const result: ServerPatchT = { ...base };

  for (const key of Object.keys(incoming) as Array<keyof ServerPatchT>) {
    const incomingVal = incoming[key];
    if (incomingVal === undefined) continue;

    const baseVal = result[key];

    // Special handling for events array: concatenate
    if (key === "events" && Array.isArray(incomingVal)) {
      const baseEvents = Array.isArray(baseVal) ? baseVal : [];
      (result as Record<string, unknown>)[key] = [
        ...baseEvents,
        ...incomingVal,
      ];
      continue;
    }

    // Special handling for __replaceKeys: union
    if (key === "__replaceKeys" && Array.isArray(incomingVal)) {
      const baseKeys = Array.isArray(baseVal) ? baseVal : [];
      const merged = [...new Set([...baseKeys, ...incomingVal])];
      (result as Record<string, unknown>)[key] = merged;
      continue;
    }

    // Deep merge objects (permanents, zones, avatars, players, etc.)
    if (
      incomingVal &&
      typeof incomingVal === "object" &&
      !Array.isArray(incomingVal) &&
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      // For nested objects like permanents["0,1"], zones.p1, avatars.p1, etc.
      const merged: Record<string, unknown> = {
        ...(baseVal as Record<string, unknown>),
      };
      for (const [subKey, subVal] of Object.entries(
        incomingVal as Record<string, unknown>
      )) {
        if (subVal === undefined) continue;
        const existingSubVal = merged[subKey];

        // Special case: permanents cell arrays - merge by instanceId
        if (
          key === "permanents" &&
          Array.isArray(subVal) &&
          Array.isArray(existingSubVal)
        ) {
          merged[subKey] = mergePermanentArrays(existingSubVal, subVal);
          continue;
        }

        // One more level of merging for things like avatars.p1.{card, pos, ...}
        if (
          subVal &&
          typeof subVal === "object" &&
          !Array.isArray(subVal) &&
          existingSubVal &&
          typeof existingSubVal === "object" &&
          !Array.isArray(existingSubVal)
        ) {
          merged[subKey] = {
            ...(existingSubVal as Record<string, unknown>),
            ...(subVal as Record<string, unknown>),
          };
        } else {
          merged[subKey] = subVal;
        }
      }
      (result as Record<string, unknown>)[key] = merged;
      continue;
    }

    // Default: overwrite
    (result as Record<string, unknown>)[key] = incomingVal;
  }

  return result;
};

/**
 * Clear the batch state. Called on transport disconnect.
 * Moves any pending batched patches to the pending queue to avoid data loss.
 */
export const clearBatchState = (
  addToPending?: (patch: ServerPatchT) => void
) => {
  if (batchedPatch && addToPending) {
    console.warn(
      "[net] clearBatchState: saving batched patch to pending queue",
      { keys: Object.keys(batchedPatch) }
    );
    addToPending(batchedPatch);
  } else if (batchedPatch) {
    console.warn("[net] clearBatchState: discarding batched patch!", {
      keys: Object.keys(batchedPatch),
    });
  }
  batchedPatch = null;
  batchFlushScheduled = false;
  batchFlushCallback = null;
};

export const setTransportStateAccessor = (fn: () => GameState) => {
  getStateAccessor = fn;
};

const stableSerialize = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "number" && Number.isNaN(value)) return "NaN";
  if (t === "number" || t === "boolean" || t === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const normalizeForSignature = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSignature(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const entries = Object.entries(record).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    for (const [key, val] of entries) {
      out[key] = normalizeForSignature(val);
    }
    return out;
  }
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (typeof value === "number" && !Number.isFinite(value)) {
    return value > 0 ? "Infinity" : "-Infinity";
  }
  return value;
};

const prunePatchSignatures = (now: number) => {
  for (const [key, entries] of pendingPatchSignatures.entries()) {
    const filtered = entries.filter((entry) => entry.expiresAt > now);
    if (filtered.length === 0) {
      pendingPatchSignatures.delete(key);
    } else if (filtered.length !== entries.length) {
      pendingPatchSignatures.set(key, filtered);
    }
  }
};

const makePatchSignature = (
  patch: ServerPatchT
): { id: string; fields: TrackedPatchField[] } | null => {
  if (!patch || typeof patch !== "object") return null;
  const parts: string[] = [];
  const fields: TrackedPatchField[] = [];
  for (const field of PATCH_SIGNATURE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const raw = (patch as Record<string, unknown>)[field];
    if (raw === undefined) continue;
    const normalized = normalizeForSignature(raw);
    parts.push(`${field}:${stableSerialize(normalized)}`);
    fields.push(field);
  }
  if (parts.length === 0) return null;
  return { id: parts.join("|"), fields };
};

export const filterEchoPatchIfAny = (
  patch: ServerPatchT
): { patch: ServerPatchT | null; matched: boolean } => {
  if (!patch || typeof patch !== "object") {
    return { patch, matched: false };
  }

  const now = Date.now();
  prunePatchSignatures(now);

  type MatchResult = {
    entry: PatchSignatureEntry;
    fields: TrackedPatchField[];
  };

  const patchRecord = patch as Record<string, unknown>;

  // Pre-compute normalized per-field signatures for the incoming patch
  const perFieldSerialized: Partial<Record<TrackedPatchField, string>> = {};
  for (const field of PATCH_SIGNATURE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patchRecord, field)) continue;
    const raw = patchRecord[field];
    if (raw === undefined) continue;
    perFieldSerialized[field] = stableSerialize(normalizeForSignature(raw));
  }

  let matched: MatchResult | null = null;

  // 1) Try an exact match on the combined signature (fast path)
  const signature = makePatchSignature(patch);
  if (signature) {
    const list = pendingPatchSignatures.get(signature.id);
    if (list && list.length > 0) {
      let matchIndex = -1;
      for (let i = 0; i < list.length; i++) {
        const candidate = list[i];
        const fields = candidate.fields ?? [];
        let matches = true;
        for (const field of fields) {
          const serialized = perFieldSerialized[field];
          if (serialized === undefined) {
            matches = false;
            break;
          }
          if (candidate.payload?.[field] !== serialized) {
            matches = false;
            break;
          }
        }
        if (matches) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex >= 0) {
        const [entry] = list.splice(matchIndex, 1);
        if (list.length === 0) {
          pendingPatchSignatures.delete(signature.id);
        } else {
          pendingPatchSignatures.set(signature.id, list);
        }
        matched = {
          entry,
          fields: entry.fields ?? [],
        };
      }
    }
  }

  // 2) Fallback: per-field echo detection for permanents only.
  // This handles cases where the server enriches the patch
  // (e.g. adds resources or events) so the combined signature changes.
  if (!matched && perFieldSerialized.permanents) {
    outer: for (const [sigId, entries] of pendingPatchSignatures.entries()) {
      for (let i = 0; i < entries.length; i++) {
        const candidate = entries[i];
        if (!candidate.fields?.includes("permanents")) continue;
        const expected = candidate.payload?.permanents;
        if (!expected || expected !== perFieldSerialized.permanents) continue;
        const [entry] = entries.splice(i, 1);
        if (entries.length === 0) {
          pendingPatchSignatures.delete(sigId);
        } else {
          pendingPatchSignatures.set(sigId, entries);
        }
        matched = {
          entry,
          fields: ["permanents"],
        };
        break outer;
      }
    }
  }

  if (!matched) {
    return { patch, matched: false };
  }

  const { entry, fields } = matched;

  if (getStateAccessor) {
    try {
      const state = getStateAccessor();
      const payload = entry.payload ?? {};
      let mustKeep = false;
      for (const field of fields) {
        if (!(field in payload)) continue;
        const currentValue = (state as Record<string, unknown>)[field];
        const serializedCurrent = stableSerialize(
          normalizeForSignature(currentValue)
        );
        if (serializedCurrent !== payload[field]) {
          mustKeep = true;
          break;
        }
      }
      if (mustKeep) {
        return { patch, matched: false };
      }
    } catch {
      // ignore comparison errors
    }
  }

  let mutated = false;
  const filtered: ServerPatchT = { ...patch };
  for (const field of fields) {
    if (field in filtered) {
      delete filtered[field as keyof ServerPatchT];
      mutated = true;
    }
  }
  if (!mutated) return { patch, matched: true };
  if (Array.isArray(filtered.__replaceKeys)) {
    const remaining = filtered.__replaceKeys.filter(
      (key) => !fields.includes(key as TrackedPatchField)
    );
    filtered.__replaceKeys = remaining.length > 0 ? remaining : undefined;
  }
  const remainingKeys = Object.keys(filtered).filter(
    (key) => key !== "__replaceKeys"
  );
  if (remainingKeys.length === 0) {
    return { patch: null, matched: true };
  }
  return { patch: filtered, matched: true };
};

const registerPatchSignature = (
  signature: { id: string; fields: TrackedPatchField[] } | null,
  patch: ServerPatchT
) => {
  if (!signature) return;
  const now = Date.now();
  prunePatchSignatures(now);

  // Prevent unbounded growth by limiting map size
  if (pendingPatchSignatures.size >= MAX_SIGNATURE_MAP_SIZE) {
    // Remove oldest entries by deleting first keys
    const keysToDelete = Array.from(pendingPatchSignatures.keys()).slice(
      0,
      Math.floor(MAX_SIGNATURE_MAP_SIZE / 4)
    );
    for (const key of keysToDelete) {
      pendingPatchSignatures.delete(key);
    }
  }

  let list = pendingPatchSignatures.get(signature.id) ?? [];

  // Limit entries per signature
  if (list.length >= MAX_ENTRIES_PER_SIGNATURE) {
    list = list.slice(-MAX_ENTRIES_PER_SIGNATURE + 1);
  }

  const payload: Record<string, string> = {};
  for (const field of signature.fields) {
    const raw = (patch as Record<string, unknown>)[field];
    if (raw === undefined) continue;
    payload[field] = stableSerialize(normalizeForSignature(raw));
  }
  list.push({
    expiresAt: now + PATCH_SIGNATURE_TTL_MS,
    fields: [...signature.fields],
    payload,
  });
  pendingPatchSignatures.set(signature.id, list);
};

/**
 * Clear all pending patch signatures. Call on transport disconnect/reset.
 */
export const clearPatchSignatures = () => {
  pendingPatchSignatures.clear();
};

export const createTransportSlice: StateCreator<
  GameState,
  [],
  [],
  TransportSlice
> = (set, get) => ({
  transport: null,
  transportSubscriptions: [],
  pendingPatches: [],

  setTransport: (t: GameTransport | null) => {
    const prev = get().transportSubscriptions;
    if (Array.isArray(prev) && prev.length > 0) {
      for (const unsubscribe of prev) {
        try {
          unsubscribe?.();
        } catch {}
      }
    }
    // Clear pending patch signatures and batch state when transport is disconnected
    // Save any pending batched patches to avoid data loss
    if (!t) {
      clearPatchSignatures();
      clearBatchState((patch) => {
        set((s) => ({
          pendingPatches: [...(s.pendingPatches || []), patch],
        }));
      });
    }
    const unsubscribers: Array<() => void> = [];
    if (t) {
      try {
        unsubscribers.push(
          t.on("interaction", (envelope) => {
            try {
              get().receiveInteractionEnvelope(envelope);
            } catch {}
          }),
          t.on("interaction:request", (msg) => {
            try {
              get().receiveInteractionEnvelope(wrapInteractionMessage(msg));
            } catch {}
          }),
          t.on("interaction:response", (msg) => {
            try {
              get().receiveInteractionEnvelope(wrapInteractionMessage(msg));
            } catch {}
          }),
          t.on("interaction:result", (msg) => {
            try {
              get().receiveInteractionResult(msg);
            } catch {}
          }),
          t.on("message", (m) => {
            try {
              get().receiveCustomMessage(m as unknown as CustomMessage);
            } catch {}
          })
        );
      } catch {}
    }
    set({ transport: t, transportSubscriptions: unsubscribers });
    if (t) {
      try {
        get().flushPendingPatches();
      } catch {}
    }
  },

  trySendPatch: (patch) => {
    const state = get();
    if (state.matchEnded) {
      try {
        const p = patch as ServerPatchT;
        const hasEndInfo =
          p && typeof p === "object" && ("matchEnded" in p || "winner" in p);
        if (!hasEndInfo) {
          console.debug("[net] trySendPatch: blocked after match ended");
          return false;
        }
      } catch {
        return false;
      }
    }
    const tr = state.transport;
    if (!patch || typeof patch !== "object") return false;
    const actorKey = get().actorKey;

    const patchObj = patch as ServerPatchT;
    const replaceKeysCandidate = Array.isArray(patchObj.__replaceKeys)
      ? patchObj.__replaceKeys
      : null;
    const isAuthoritativeSnapshot = !!(
      replaceKeysCandidate && replaceKeysCandidate.length > 0
    );

    // Authoritative snapshots bypass batching and send immediately
    if (isAuthoritativeSnapshot) {
      if (!tr) {
        set((s) => ({ pendingPatches: [...s.pendingPatches, patchObj] }));
        console.warn("[net] Transport unavailable: queued snapshot patch");
        return false;
      }
      try {
        tr.sendAction(patchObj);
        set({ lastLocalActionTs: Date.now() });
        return true;
      } catch (err) {
        set((s) => ({ pendingPatches: [...s.pendingPatches, patchObj] }));
        console.warn(`[net] Snapshot send failed: ${String(err)}`);
        return false;
      }
    }

    // Queue seat-specific patches if actorKey not yet set (online mode only)
    // Local/offline transports don't need actorKey validation - they handle both seats locally
    const isLocalTransport = tr?.isLocal === true;
    const touchesSeatFields =
      (patchObj.avatars && typeof patchObj.avatars === "object") ||
      (patchObj.zones && typeof patchObj.zones === "object");
    if (!actorKey && touchesSeatFields && !isLocalTransport) {
      set((s) => {
        const queue = Array.isArray(s.pendingPatches) ? s.pendingPatches : [];
        return {
          pendingPatches: [...queue, clonePatchForQueue(patchObj)],
        } as Partial<GameState> as GameState;
      });
      try {
        console.warn(
          "[net] trySendPatch: queued seat-specific patch until actorKey is set",
          { keys: Object.keys(patchObj.zones ?? {}) }
        );
      } catch {}
      return false;
    }

    // Sanitize: only include actor's own seat data (online mode only)
    // Local transports send full patches since both players are controlled locally
    const sanitized: ServerPatchT = { ...patchObj };
    if (!isLocalTransport) {
      try {
        if (sanitized.avatars && typeof sanitized.avatars === "object") {
          const keys = Object.keys(sanitized.avatars).filter(
            (k) => k === "p1" || k === "p2"
          ) as PlayerKey[];
          const out: Partial<GameState["avatars"]> = {};
          if (actorKey && keys.includes(actorKey)) {
            out[actorKey] = (sanitized.avatars as GameState["avatars"])[
              actorKey
            ];
          }
          if (Object.keys(out).length > 0) {
            sanitized.avatars = out as GameState["avatars"];
          } else {
            delete (sanitized as unknown as { avatars?: unknown }).avatars;
          }
        }
        if (sanitized.zones && typeof sanitized.zones === "object") {
          const z = sanitized.zones as Partial<Record<PlayerKey, Zones>>;
          const outZ: Partial<Record<PlayerKey, Zones>> = {};
          if (actorKey && z[actorKey]) {
            outZ[actorKey] = z[actorKey] as Zones;
          }
          if (Object.keys(outZ).length > 0) {
            sanitized.zones = outZ as GameState["zones"];
          } else {
            delete (sanitized as unknown as { zones?: unknown }).zones;
          }
        }
      } catch {}
    }

    if (process.env.NODE_ENV !== "production") {
      try {
        if (sanitized.avatars && typeof sanitized.avatars === "object") {
          console.debug("[net] trySendPatch avatars ->", {
            actorKey,
            avatars: sanitized.avatars,
          });
        }
      } catch {}
    }

    // Log incoming patch for debugging
    if (process.env.NODE_ENV !== "production") {
      const incomingKeys = Object.keys(sanitized).filter(
        (k) => k !== "__replaceKeys"
      );
      const hasPermanents = "permanents" in sanitized;
      const hasZones = "zones" in sanitized;
      if (hasPermanents || hasZones) {
        console.debug("[net] trySendPatch adding to batch:", {
          keys: incomingKeys,
          hasPermanents,
          hasZones,
          permanentCells: hasPermanents
            ? Object.keys(sanitized.permanents || {})
            : [],
          batchWasEmpty: batchedPatch === null,
        });
      }
    }

    // Add to batch
    const prevBatch = batchedPatch;
    batchedPatch = mergePatch(batchedPatch, sanitized);

    // Verify permanents weren't lost in merge
    if (process.env.NODE_ENV !== "production") {
      const hadPermanentsIncoming = "permanents" in sanitized;
      const hasPermanentsAfterMerge =
        batchedPatch && "permanents" in batchedPatch;
      if (hadPermanentsIncoming && !hasPermanentsAfterMerge) {
        console.error("[net] BUG: permanents lost during merge!", {
          incoming: sanitized,
          prevBatch,
          result: batchedPatch,
        });
      }
    }

    // Schedule flush if not already scheduled
    if (!batchFlushScheduled) {
      batchFlushScheduled = true;
      batchFlushCallback = () => {
        const patchToSend = batchedPatch;
        batchedPatch = null;
        batchFlushScheduled = false;
        batchFlushCallback = null;

        if (!patchToSend) {
          console.warn("[net] Batch flush called but patch was null");
          return;
        }

        const currentTr = get().transport;
        if (!currentTr) {
          set((s) => ({ pendingPatches: [...s.pendingPatches, patchToSend] }));
          console.warn("[net] Transport unavailable at flush: queued batch");
          return;
        }

        try {
          const signatureInfo = makePatchSignature(patchToSend);
          currentTr.sendAction(patchToSend);
          if (signatureInfo && signatureInfo.fields.length > 0) {
            registerPatchSignature(signatureInfo, patchToSend);
          }
          set({ lastLocalActionTs: Date.now() });

          // Always log sent patches in dev
          if (process.env.NODE_ENV !== "production") {
            const keys = Object.keys(patchToSend).filter(
              (k) => k !== "__replaceKeys"
            );
            const hasPermanents = "permanents" in patchToSend;
            console.debug("[net] Sent batched patch:", {
              keys,
              hasPermanents,
              permanentCells: hasPermanents
                ? Object.keys(patchToSend.permanents || {})
                : [],
            });
          }
        } catch (err) {
          set((s) => ({ pendingPatches: [...s.pendingPatches, patchToSend] }));
          console.warn(`[net] Batch send failed: ${String(err)}`);
        }
      };
      queueMicrotask(batchFlushCallback);
    }

    return true;
  },

  // D20 patches bypass batching and send immediately for reliability
  trySendD20Patch: (patch) => {
    const state = get();
    const tr = state.transport;
    if (!patch || typeof patch !== "object") return false;

    const patchObj = patch as ServerPatchT;

    // D20 patches don't need sanitization - they only contain d20Rolls and setupWinner
    // Send immediately without batching
    if (!tr) {
      set((s) => ({ pendingPatches: [...s.pendingPatches, patchObj] }));
      console.warn("[net] Transport unavailable: queued D20 patch");
      return false;
    }

    try {
      console.log("[D20] Sending patch immediately (bypass batching)", {
        d20Rolls: patchObj.d20Rolls,
        setupWinner: patchObj.setupWinner,
      });
      tr.sendAction(patchObj);
      set({ lastLocalActionTs: Date.now() });
      return true;
    } catch (err) {
      set((s) => ({ pendingPatches: [...s.pendingPatches, patchObj] }));
      console.warn(`[net] D20 patch send failed: ${String(err)}`);
      return false;
    }
  },

  flushPendingPatches: () => {
    const queue = get().pendingPatches;
    if (!Array.isArray(queue) || queue.length === 0) return;
    const tr = get().transport;
    const actorKey = get().actorKey;
    if (!tr || !actorKey) return;

    const remaining: ServerPatchT[] = [];
    for (const p of queue) {
      try {
        let toSend: ServerPatchT = p as ServerPatchT;
        const replaceKeysCandidate = Array.isArray(
          (p as ServerPatchT).__replaceKeys
        )
          ? (p as ServerPatchT).__replaceKeys
          : null;
        const isAuthoritativeSnapshot = !!(
          replaceKeysCandidate && replaceKeysCandidate.length > 0
        );
        let signatureInfo: ReturnType<typeof makePatchSignature> | null = null;
        if (!isAuthoritativeSnapshot) {
          try {
            const sanitized: ServerPatchT = { ...(p as ServerPatchT) };
            if (sanitized.avatars && typeof sanitized.avatars === "object") {
              const keys = Object.keys(sanitized.avatars).filter(
                (k) => k === "p1" || k === "p2"
              ) as PlayerKey[];
              const out: Partial<GameState["avatars"]> = {};
              if (keys.includes(actorKey as PlayerKey)) {
                const v = (sanitized.avatars as GameState["avatars"])[
                  actorKey as PlayerKey
                ];
                if (v && typeof v === "object") {
                  (out as Record<string, unknown>)[actorKey as PlayerKey] = {
                    ...(v as Record<string, unknown>),
                  } as unknown;
                }
              }
              if (Object.keys(out).length > 0) {
                sanitized.avatars = out as GameState["avatars"];
              } else {
                delete (sanitized as unknown as { avatars?: unknown }).avatars;
              }
            }
            if (sanitized.zones && typeof sanitized.zones === "object") {
              const z = sanitized.zones as Partial<Record<PlayerKey, Zones>>;
              const outZ: Partial<Record<PlayerKey, Zones>> = {};
              if (z[actorKey as PlayerKey]) {
                outZ[actorKey as PlayerKey] = z[actorKey as PlayerKey] as Zones;
              }
              if (Object.keys(outZ).length > 0) {
                sanitized.zones = outZ as GameState["zones"];
              } else {
                delete (sanitized as unknown as { zones?: unknown }).zones;
              }
            }
            toSend = sanitized;
          } catch {}
        }
        if (!isAuthoritativeSnapshot) {
          signatureInfo = makePatchSignature(toSend);
        }
        tr.sendAction(toSend);
        if (signatureInfo && signatureInfo.fields.length > 0) {
          registerPatchSignature(signatureInfo, toSend);
        }
      } catch (err) {
        remaining.push(p as ServerPatchT);
        try {
          console.warn(`[net] Flush failed: ${String(err)}`);
        } catch {}
      }
    }
    if (remaining.length === 0) set({ pendingPatches: [] });
    else set({ pendingPatches: remaining });
  },
});
