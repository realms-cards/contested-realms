export type MatchPermanent = Record<string, unknown>;

export type MatchPermanents = Record<string, MatchPermanent[]>;

export interface MatchConsoleEvent extends Record<string, unknown> {
  id?: number | string;
  ts?: number | string;
  text?: string;
}

export const MAX_CONSOLE_EVENTS = 200;

const PERM_INSTANCE_PREFIX = Math.random().toString(36).slice(2, 6);
let permInstanceSeq = 0;
function newPermanentInstanceId(): string {
  return `perm_${PERM_INSTANCE_PREFIX}_${Date.now().toString(36)}_${permInstanceSeq++}`;
}

function ensurePermanentRecord(
  record: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!record) return null;
  const ownerValue = record.owner as unknown;
  if (ownerValue === 1 || ownerValue === 2) {
    // valid numeric owner, keep as-is
  } else if (typeof ownerValue === "string") {
    const n = Number(ownerValue);
    if (n === 1 || n === 2) record.owner = n;
    else delete (record as Record<string, unknown>).owner;
  } else if (ownerValue !== undefined) {
    // invalid owner present, drop it to avoid overriding base
    delete (record as Record<string, unknown>).owner;
  }
  const cardValue = record.card;
  const card = cardValue && typeof cardValue === "object"
    ? (cardValue as Record<string, unknown>)
    : null;
  let instanceId = typeof record.instanceId === "string" ? record.instanceId : null;
  const cardInstanceId = card && typeof card.instanceId === "string" ? card.instanceId : null;
  if (!instanceId || instanceId.length === 0) {
    instanceId = cardInstanceId;
  }
  if (!instanceId || instanceId.length === 0) {
    instanceId = newPermanentInstanceId();
  }
  record.instanceId = instanceId;
  if (card && (!cardInstanceId || cardInstanceId.length === 0)) {
    card.instanceId = instanceId;
  }
  const tapVersion = Number(record.tapVersion ?? 0);
  record.tapVersion = Number.isFinite(tapVersion) && tapVersion >= 0 ? tapVersion : 0;
  const version = Number(record.version ?? 0);
  record.version = Number.isFinite(version) && version >= 0 ? version : 0;
  return record;
}

function makePermanentFallbackKey(record: Record<string, unknown>): string | null {
  const owner = record.owner;
  const card = record.card as Record<string, unknown> | undefined;
  if (!card) {
    return typeof record.instanceId === "string"
      ? `id:${record.instanceId}`
      : null;
  }
  const cardId = card.cardId ?? card.slug ?? card.name ?? record.instanceId ?? "unknown";
  const attached = record.attachedTo as { at?: string; index?: number } | undefined;
  const attachedKey = attached ? `${attached.at ?? ""}|${attached.index ?? ""}` : "none";
  return `${owner ?? ""}|${cardId}|${attachedKey}`;
}

export function mergeEvents(
  prev: ReadonlyArray<MatchConsoleEvent> | undefined,
  additions: ReadonlyArray<MatchConsoleEvent> | undefined
): MatchConsoleEvent[] {
  const merged = new Map<string, MatchConsoleEvent>();

  if (Array.isArray(prev)) {
    for (const event of prev) {
      if (!event) continue;
      merged.set(stableEventKey(event), event);
    }
  }

  if (Array.isArray(additions)) {
    for (const event of additions) {
      if (!event) continue;
      merged.set(stableEventKey(event), event);
    }
  }

  const ordered = Array.from(merged.values()).sort((a, b) => {
    const tsA = normalizeNumericField(a.ts);
    const tsB = normalizeNumericField(b.ts);
    if (tsA !== tsB) return tsA - tsB;
    const idA = normalizeNumericField(a.id);
    const idB = normalizeNumericField(b.id);
    return idA - idB;
  });

  return ordered.length > MAX_CONSOLE_EVENTS
    ? ordered.slice(-MAX_CONSOLE_EVENTS)
    : ordered;
}

export function dedupePermanents(
  permanents: unknown
): MatchPermanents | null | undefined {
  try {
    if (!permanents || typeof permanents !== "object") {
      return permanents as MatchPermanents | null | undefined;
    }

    const input = permanents as Record<string, unknown>;
    const result: MatchPermanents = {};

    for (const [cell, entries] of Object.entries(input)) {
      const list = Array.isArray(entries) ? entries : [];
      const filtered: MatchPermanent[] = [];

      for (const item of list) {
        if (item && typeof item === "object") {
          filtered.push(item as MatchPermanent);
        }
      }

      result[cell] = filtered;
    }

    return result;
  } catch {
    return permanents as MatchPermanents | null | undefined;
  }
}

function extractInstanceId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).instanceId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function mergeArrayByInstanceId(
  baseArr: unknown[],
  patchArr: unknown[]
): unknown[] {
  const patchMap = new Map<string, Record<string, unknown>>();
  const fallbackMap = new Map<string, Record<string, unknown>>();
  const normalizedPatch: Record<string, unknown>[] = [];
  for (const item of patchArr) {
    if (!item || typeof item !== "object") continue;
    const normalized = ensurePermanentRecord(item as Record<string, unknown>);
    if (!normalized) continue;
    normalizedPatch.push(normalized);
    const id = extractInstanceId(normalized);
    if (id) patchMap.set(id, normalized);
    const key = makePermanentFallbackKey(normalized);
    if (key) fallbackMap.set(key, normalized);
  }
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const baseItem of baseArr) {
    if (!baseItem || typeof baseItem !== "object") continue;
    const baseRecord = ensurePermanentRecord(baseItem as Record<string, unknown>);
    if (!baseRecord) continue;
    let id = extractInstanceId(baseRecord);
    const ensureFallbackMatch = () => {
      const fallbackKey = makePermanentFallbackKey(baseRecord);
      if (fallbackKey && fallbackMap.has(fallbackKey)) {
        const patchRecord = fallbackMap.get(fallbackKey) as Record<string, unknown>;
        const patchId = extractInstanceId(patchRecord);
        if (patchId) {
          baseRecord.instanceId = patchId;
          id = patchId;
        }
      }
    };
    if (!id) {
      ensureFallbackMatch();
    } else if (!patchMap.has(id)) {
      ensureFallbackMatch();
    }
    if (id && patchMap.has(id)) {
      const patchRecord = patchMap.get(id) as Record<string, unknown>;
      const shouldRemove = patchRecord.__remove === true;
      const merged: Record<string, unknown> = { ...baseRecord };
      const baseTapVersion = Number(baseRecord.tapVersion ?? 0);
      const patchTapVersionRaw = patchRecord.tapVersion;
      const patchTapVersion =
        typeof patchTapVersionRaw === "number" ? patchTapVersionRaw : null;
      const allowTapUpdate =
        patchTapVersion !== null && patchTapVersion >= baseTapVersion;
      const baseVersion = Number(baseRecord.version ?? 0);
      const patchVersionRaw = patchRecord.version;
      const patchVersion =
        typeof patchVersionRaw === "number" ? patchVersionRaw : null;
      const allowGenericUpdate =
        patchVersion === null ? true : patchVersion >= baseVersion;
      if (!shouldRemove) {
        for (const [key, value] of Object.entries(patchRecord)) {
          if (key === "instanceId" || key === "__remove" || value === undefined)
            continue;
          if (key === "tapped") {
            if (allowTapUpdate) {
              merged.tapped = value;
              merged.tapVersion = patchTapVersion;
            }
            continue;
          }
          if (key === "tapVersion") {
            if (allowTapUpdate) merged.tapVersion = patchTapVersion;
            continue;
          }
          if (key === "version") {
            if (allowGenericUpdate) merged.version = patchVersion;
            continue;
          }
          if (!allowGenericUpdate) {
            continue;
          }
          merged[key] = value;
        }
        if (!allowTapUpdate && baseTapVersion !== undefined) {
          merged.tapVersion = baseTapVersion;
        }
        if (!allowGenericUpdate && baseVersion !== undefined) {
          merged.version = baseVersion;
        } else if (allowGenericUpdate && patchVersion !== null) {
          merged.version = patchVersion;
        }
        result.push(merged);
      }
      seen.add(id);
      patchMap.delete(id);
      const fallbackKey = makePermanentFallbackKey(baseRecord);
      if (fallbackKey) fallbackMap.delete(fallbackKey);
      if (shouldRemove) {
        continue;
      }
    } else {
      result.push(baseItem);
      if (id) seen.add(id);
    }
  }
  for (const item of normalizedPatch) {
    const id = extractInstanceId(item);
    if (!id || !seen.has(id)) {
      if (item && typeof item === "object") {
        const record = { ...(item as Record<string, unknown>) };
        if (record.__remove === true) continue;
        delete record.__remove;
        result.push(record);
      } else {
        result.push(item);
      }
      if (id) seen.add(id);
    }
  }
  // Note: Base items preservation is handled at lines 231-233 above
  // This version already correctly preserves items from base not in patch
  return result;
}

export function deepMergeReplaceArrays<T>(base: T, patch: unknown, path: string[] = []): T {
  if (patch === undefined) {
    return base;
  }

  if (patch === null || typeof patch !== "object") {
    return patch as T;
  }

  if (Array.isArray(patch)) {
    // CRITICAL FIX: Only use instanceId merging for permanents cell arrays
    // For zone arrays (hand, graveyard, etc.), we want REPLACEMENT not merging
    //
    // Path examples:
    // - permanents cell: ["permanents", "aura_1_2"] -> use instanceId merge
    // - zone array: ["zones", "p1", "hand"] -> use replacement
    const isWithinZones = path.includes("zones");
    const isWithinPermanents = path.length >= 1 && path[0] === "permanents";

    const baseHasIds = Array.isArray(base) && base.some((item) => extractInstanceId(item));
    const patchHasIds = patch.some((item) => extractInstanceId(item));

    // Only merge by instanceId for permanents, NOT for zones
    if (isWithinPermanents && !isWithinZones && (baseHasIds || patchHasIds)) {
      const baseArray = Array.isArray(base) ? base : [];
      return mergeArrayByInstanceId(baseArray, patch) as unknown as T;
    }

    // For zones and other arrays, replace entirely
    return patch as unknown as T;
  }

  const source = patch as Record<string, unknown>;
  const target =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {};

  const output: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const current = output[key];
    output[key] = deepMergeReplaceArrays(current, value, [...path, key]);
  }

  return output as T;
}

function normalizeNumericField(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stableEventKey(event: MatchConsoleEvent): string {
  return `${String(event.id ?? "")}|${String(event.ts ?? "")}|${String(
    event.text ?? ""
  )}`;
}
