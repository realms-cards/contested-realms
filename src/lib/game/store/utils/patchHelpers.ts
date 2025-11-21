import type {
  CardRef,
  CellKey,
  GameState,
  Permanents,
  PermanentItem,
  ServerPatchT,
  Thresholds,
} from "../types";
import { newPermanentInstanceId } from "./idHelpers";
import { ensurePermanentInstanceId } from "./permanentHelpers";

type PermanentRecord = Record<string, unknown>;

export type PermanentDeltaUpdate = {
  at: CellKey;
  entry: Partial<PermanentItem>;
  remove?: boolean;
};

export function extractInstanceId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).instanceId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function ensurePermanentRecord(
  record: PermanentRecord | null | undefined
): PermanentRecord | null {
  if (!record) return null;
  const ownerValue = record.owner as unknown;
  if (ownerValue === 1 || ownerValue === 2) {
    // valid numeric owner, keep as-is
  } else if (typeof ownerValue === "string") {
    const n = Number(ownerValue);
    if (n === 1 || n === 2) record.owner = n;
    else delete (record as PermanentRecord).owner;
  } else if (ownerValue !== undefined) {
    delete (record as PermanentRecord).owner;
  }
  const cardValue = record.card;
  const card =
    cardValue && typeof cardValue === "object"
      ? (cardValue as PermanentRecord)
      : null;
  let instanceId =
    typeof record.instanceId === "string" ? record.instanceId : null;
  const cardInstanceId =
    card && typeof card.instanceId === "string" ? card.instanceId : null;
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
  record.tapVersion =
    Number.isFinite(tapVersion) && tapVersion >= 0 ? tapVersion : 0;
  const version = Number(record.version ?? 0);
  record.version = Number.isFinite(version) && version >= 0 ? version : 0;
  return record;
}

function makePermanentFallbackKey(record: PermanentRecord): string | null {
  const owner = record.owner;
  const card = record.card as PermanentRecord | undefined;
  if (!card) {
    return typeof record.instanceId === "string"
      ? `id:${record.instanceId}`
      : null;
  }
  const cardId =
    card.cardId ?? card.slug ?? card.name ?? record.instanceId ?? "unknown";
  const attached = record.attachedTo as { at?: string; index?: number } | undefined;
  const attachedKey = attached ? `${attached.at ?? ""}|${attached.index ?? ""}` : "none";
  return `${owner ?? ""}|${cardId}|${attachedKey}`;
}

export function mergeArrayByInstanceId(
  baseArr: unknown[],
  patchArr: unknown[]
): unknown[] {
  const patchMap = new Map<string, Record<string, unknown>>();
  const fallbackMap = new Map<string, Record<string, unknown>>();
  const normalizedPatch: Record<string, unknown>[] = [];
  for (const item of patchArr) {
    if (!item || typeof item !== "object") continue;
    const normalized = ensurePermanentRecord(item as PermanentRecord);
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
    const baseRecord = ensurePermanentRecord(
      baseItem as PermanentRecord
    );
    if (!baseRecord) continue;
    let id = extractInstanceId(baseRecord);
    const ensureFallbackMatch = () => {
      const fallbackKey = makePermanentFallbackKey(baseRecord);
      if (fallbackKey && fallbackMap.has(fallbackKey)) {
        const patchRecord = fallbackMap.get(
          fallbackKey
        ) as Record<string, unknown>;
        const patchId = extractInstanceId(patchRecord);
        if (patchId) {
          baseRecord.instanceId = patchId;
          id = patchId;
        }
      }
    };
    // Only use fallback matching when the base permanent has no instanceId
    // This prevents incorrectly matching different permanents with the same card
    if (!id) {
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
  return result;
}

export function deepMergeReplaceArrays<T>(
  base: T,
  patch: unknown,
  path: string[] = []
): T {
  if (patch === undefined) return base as T;
  if (patch === null) return null as unknown as T;
  if (Array.isArray(patch)) {
    const isWithinZones = path.includes("zones");
    const isWithinPermanents = path.length >= 1 && path[0] === "permanents";

    const baseHasIds =
      Array.isArray(base) && base.some((item) => extractInstanceId(item));
    const patchHasIds = patch.some((item) => extractInstanceId(item));

    if (isWithinPermanents && !isWithinZones && (baseHasIds || patchHasIds)) {
      const baseArray = Array.isArray(base) ? base : [];
      return mergeArrayByInstanceId(baseArray, patch) as unknown as T;
    }

    return patch as unknown as T;
  }
  if (typeof patch !== "object") return patch as T;

  const baseObj =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const out: Record<string, unknown> = { ...baseObj };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = deepMergeReplaceArrays(
      cur as unknown,
      v as unknown,
      [...path, k]
    ) as unknown;
  }
  return out as unknown as T;
}

function uniqueCellList(cells: CellKey | CellKey[]): CellKey[] {
  const arr = Array.isArray(cells) ? cells : [cells];
  const seen = new Set<CellKey>();
  const result: CellKey[] = [];
  for (const cell of arr) {
    if (typeof cell !== "string") continue;
    if (seen.has(cell)) continue;
    seen.add(cell);
    result.push(cell);
  }
  return result;
}

export function mergePermanentsMap(
  base: Permanents,
  patch: unknown
): Permanents {
  const result: Permanents = { ...(base || ({} as Permanents)) } as Permanents;
  if (!patch || typeof patch !== "object") return result;
  const perPatch = patch as Record<string, unknown>;
  for (const [cell, value] of Object.entries(perPatch)) {
    const nextArr = Array.isArray(value) ? (value as unknown[]) : [];
    const baseArr = Array.isArray(result[cell as keyof Permanents])
      ? ((result[cell as keyof Permanents] as unknown[]) || [])
      : [];
    const merged = mergeArrayByInstanceId(
      baseArr,
      nextArr
    ) as unknown as PermanentItem[];
    (result as Record<string, PermanentItem[]>)[cell] = merged;
  }
  return result;
}

export function createPermanentsPatch(
  per: Permanents,
  cells?: CellKey | CellKey[] | null
): ServerPatchT {
  if (!cells || (Array.isArray(cells) && cells.length === 0)) {
    return {
      permanents: per as GameState["permanents"],
    } as ServerPatchT;
  }
  const payload: Partial<Permanents> = {};
  for (const cell of uniqueCellList(cells)) {
    const items = per[cell];
    payload[cell] = Array.isArray(items)
      ? (items.map((item) =>
          item && typeof item === "object"
            ? ({ ...item } as PermanentItem)
            : item
        ) as PermanentItem[])
      : ([] as PermanentItem[]);
  }
  return {
    permanents: payload as GameState["permanents"],
  } as ServerPatchT;
}

export function createPermanentDeltaPatch(
  updates: PermanentDeltaUpdate[]
): ServerPatchT | null {
  if (!updates || updates.length === 0) return null;
  const payload: Record<string, PermanentItem[]> = {};
  for (const { at, entry, remove } of updates) {
    const id = entry.instanceId;
    if (!id || typeof id !== "string" || id.length === 0) {
      return null;
    }
    const target = (payload[at] ??= []);
    const record: Record<string, unknown> = { instanceId: id };
    if (remove) {
      record.__remove = true;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (key === "instanceId" || value === undefined) continue;
      record[key] = value;
    }
    target.push(record as PermanentItem);
  }
  return {
    permanents: payload as GameState["permanents"],
  } as ServerPatchT;
}

export function cloneCardForPatch(card: CardRef): CardRef {
  return {
    ...card,
    thresholds: card.thresholds
      ? { ...(card.thresholds as Partial<Thresholds>) }
      : card.thresholds ?? null,
  };
}

export function buildMoveDeltaPatch(
  fromKey: CellKey,
  toKey: CellKey,
  removed: PermanentItem[],
  updated: PermanentItem[],
  added: PermanentItem[],
  per: Permanents,
  prevPer: Permanents
): ServerPatchT {
  console.log("[buildMoveDeltaPatch] Building patch:", {
    fromKey,
    toKey,
    removedCount: removed.length,
    removedNames: removed.map((r) => r.card.name),
    updatedCount: updated.length,
    updatedNames: updated.map((u) => u.card.name),
    addedCount: added.length,
    addedNames: added.map((a) => a.card.name),
  });
  const deltaUpdates: PermanentDeltaUpdate[] = [];
  let deltaValid = true;
  for (const entry of removed) {
    const id = ensurePermanentInstanceId(entry);
    if (!id) {
      deltaValid = false;
      break;
    }
    deltaUpdates.push({
      at: fromKey,
      entry: { instanceId: id },
      remove: true,
    });
  }
  if (deltaValid) {
    for (const entry of updated) {
      const id = ensurePermanentInstanceId(entry);
      if (!id) {
        deltaValid = false;
        break;
      }
      console.log("[buildMoveDeltaPatch] Processing updated entry:", {
        name: entry.card.name,
        owner: entry.owner,
        tapped: entry.tapped,
        attachedTo: entry.attachedTo,
      });
      const patchEntry: Partial<PermanentItem> = {
        instanceId: id,
      };
      if (entry.attachedTo !== undefined) {
        patchEntry.attachedTo = entry.attachedTo
          ? { ...entry.attachedTo }
          : entry.attachedTo ?? null;
      }
      if (entry.offset !== undefined) patchEntry.offset = entry.offset;
      if (entry.tilt !== undefined) patchEntry.tilt = entry.tilt;
      if (entry.tapped !== undefined) patchEntry.tapped = entry.tapped;
      if (entry.tapVersion !== undefined)
        patchEntry.tapVersion = entry.tapVersion;
      if (entry.counters !== undefined) {
        patchEntry.counters = entry.counters;
      }
      if (entry.version !== undefined) {
        patchEntry.version = entry.version;
      }
      console.log("[buildMoveDeltaPatch] Created patch entry:", patchEntry);
      deltaUpdates.push({
        at: fromKey,
        entry: patchEntry,
      });
    }
  }
  if (deltaValid) {
    for (const entry of added) {
      const id = ensurePermanentInstanceId(entry);
      if (!id) {
        deltaValid = false;
        break;
      }
      console.log("[buildMoveDeltaPatch] Processing added entry:", {
        name: entry.card.name,
        owner: entry.owner,
        tapped: entry.tapped,
        attachedTo: entry.attachedTo,
      });
      const patchEntry: Partial<PermanentItem> = {
        instanceId: id,
        owner: entry.owner,
        card: cloneCardForPatch(entry.card),
      };
      if (entry.offset !== undefined) patchEntry.offset = entry.offset;
      if (entry.tilt !== undefined) patchEntry.tilt = entry.tilt;
      if (entry.tapped !== undefined) patchEntry.tapped = entry.tapped;
      if (entry.tapVersion !== undefined)
        patchEntry.tapVersion = entry.tapVersion;
      if (entry.attachedTo !== undefined) {
        patchEntry.attachedTo = entry.attachedTo
          ? { ...entry.attachedTo }
          : entry.attachedTo ?? null;
      }
      if (entry.counters !== undefined) {
        patchEntry.counters = entry.counters;
      }
      if (entry.version !== undefined) {
        patchEntry.version = entry.version;
      }
      console.log("[buildMoveDeltaPatch] Created patch entry for added:", patchEntry);
      deltaUpdates.push({
        at: toKey,
        entry: patchEntry,
      });
    }
  }
  const deltaPatch =
    deltaValid && deltaUpdates.length > 0
      ? createPermanentDeltaPatch(deltaUpdates)
      : null;
  const fallbackPatch = createPermanentsPatch(per ?? prevPer, [
    fromKey,
    toKey,
  ]);

  if (!deltaPatch) {
    console.log("[buildMoveDeltaPatch] Delta invalid, using fallback patch");
    console.log("[buildMoveDeltaPatch] Fallback includes cells:", [fromKey, toKey]);
    console.log("[buildMoveDeltaPatch] Fallback fromKey permanents:",
      (per ?? prevPer)[fromKey]?.map((p) => ({
        name: p.card.name,
        tapped: p.tapped,
        owner: p.owner,
        attachedTo: p.attachedTo
      })));
    console.log("[buildMoveDeltaPatch] Fallback toKey permanents:",
      (per ?? prevPer)[toKey]?.map((p) => ({
        name: p.card.name,
        tapped: p.tapped,
        owner: p.owner,
        attachedTo: p.attachedTo
      })));
  } else {
    console.log("[buildMoveDeltaPatch] Using delta patch with", deltaUpdates.length, "updates");
  }

  return deltaPatch ?? fallbackPatch;
}

export function clonePatchForQueue(patch: ServerPatchT): ServerPatchT {
  return JSON.parse(JSON.stringify(patch)) as ServerPatchT;
}
