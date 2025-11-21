import type { CellKey, Permanents, PermanentItem } from "../types";
import { ensureCardInstanceId } from "./cardHelpers";
import { newPermanentInstanceId } from "./idHelpers";

export const randomTilt = (): number => Math.random() * 0.1 - 0.05;

export type MovePermanentResult = {
  per: Permanents;
  movedName: string;
  removed: PermanentItem[];
  added: PermanentItem[];
  updated: PermanentItem[];
  newIndex: number;
};

export function movePermanentCore(
  perIn: Permanents,
  fromKey: CellKey,
  index: number,
  toKey: CellKey,
  newOffset: [number, number] | null
): MovePermanentResult {
  const per: Permanents = { ...perIn };
  const fromArr = [...(per[fromKey] || [])];
  const spliced = fromArr.splice(index, 1);
  const item = spliced[0];
  if (!item) {
    return {
      per: perIn,
      movedName: "",
      removed: [],
      added: [],
      updated: [],
      newIndex: -1,
    };
  }

  const removedItems: PermanentItem[] = [];
  const addedItems: PermanentItem[] = [];
  const updatedItems: PermanentItem[] = [];

  removedItems.push(item);
  const baseVersion = ensurePermanentVersion(item);

  const attachedTokenIndices: number[] = [];
  fromArr.forEach((perm, idx) => {
    if (
      perm.attachedTo &&
      perm.attachedTo.at === fromKey &&
      perm.attachedTo.index === index
    ) {
      attachedTokenIndices.push(idx);
    }
  });

  const attachedTokens: PermanentItem[] = [];
  attachedTokenIndices
    .sort((a, b) => b - a)
    .forEach((tokenIdx) => {
      const removed = fromArr.splice(tokenIdx, 1)[0];
      if (removed) {
        removedItems.push(removed);
        attachedTokens.unshift(removed);
      }
    });

  fromArr.forEach((perm, idx) => {
    if (perm.attachedTo && perm.attachedTo.at === fromKey) {
      const currentAttached = perm.attachedTo;
      let newIndexBase = currentAttached.index;
      for (const removedIdx of attachedTokenIndices) {
        if (removedIdx < perm.attachedTo.index) {
          newIndexBase--;
        }
      }
      if (index < perm.attachedTo.index) {
        newIndexBase--;
      }
      if (newIndexBase !== currentAttached.index) {
        const nextAttachment = { ...currentAttached, index: newIndexBase };
        const updatedItem = bumpPermanentVersion({
          ...perm,
          attachedTo: nextAttachment,
        });
        fromArr[idx] = updatedItem;
        updatedItems.push(updatedItem);
      }
    }
  });

  const targetSource =
    toKey === fromKey ? fromArr : (per[toKey] as PermanentItem[]) || [];
  const toArr = [...targetSource];
  const toArrStartLen = toArr.length;
  const newIndex = toArrStartLen;

  const toPush: PermanentItem =
    newOffset == null
      ? item.tilt == null
        ? { ...item, tilt: randomTilt() }
        : { ...item }
      : { ...item, offset: newOffset, tilt: item.tilt ?? randomTilt() };
  toPush.version = baseVersion + 1;
  toArr.push(toPush);

  attachedTokens.forEach((token) => {
    const tokenVersion = ensurePermanentVersion(token) + 1;
    toArr.push({
      ...token,
      attachedTo: { at: toKey, index: newIndex },
      version: tokenVersion,
    });
  });

  per[fromKey] = fromArr;
  per[toKey] = toArr;
  const addedSlice = toArr.slice(toArrStartLen);
  addedItems.push(...addedSlice);

  return {
    per,
    movedName: item.card.name,
    removed: removedItems,
    added: addedItems,
    updated: updatedItems,
    newIndex,
  };
}

export function moveAvatarAttachedArtifacts(
  permanents: Permanents,
  oldTileKey: CellKey,
  newTileKey: CellKey
): { permanents: Permanents; movedArtifacts: PermanentItem[] } {
  const per: Permanents = { ...permanents };
  const oldArr = [...(per[oldTileKey] || [])];
  const movedArtifacts: PermanentItem[] = [];

  const attachedIndices: number[] = [];
  oldArr.forEach((perm, idx) => {
    if (
      perm.attachedTo &&
      perm.attachedTo.index === -1 &&
      perm.attachedTo.at === oldTileKey
    ) {
      attachedIndices.push(idx);
    }
  });

  attachedIndices
    .sort((a, b) => b - a)
    .forEach((idx) => {
      const removed = oldArr.splice(idx, 1)[0];
      if (removed) {
        movedArtifacts.push(removed);
      }
    });

  let newArr = [...(per[newTileKey] || [])];
  const movedIds = new Set(
    movedArtifacts
      .map((artifact) => ensurePermanentInstanceId(artifact))
      .filter((id): id is string => !!id)
  );
  newArr = newArr.filter((item) => {
    const id = ensurePermanentInstanceId(item as PermanentItem);
    if (!id || !movedIds.has(id)) return true;
    const at = (item as PermanentItem).attachedTo;
    return !(at && at.index === -1 && at.at === newTileKey);
  });
  movedArtifacts.reverse().forEach((artifact) => {
    const updatedArtifact = bumpPermanentVersion({
      ...artifact,
      attachedTo: { at: newTileKey, index: -1 },
    });
    newArr.push(updatedArtifact);
  });

  per[oldTileKey] = oldArr;
  per[newTileKey] = newArr;

  return { permanents: per, movedArtifacts };
}

export function ensurePermanentInstanceId(item: PermanentItem): string | null {
  if (item.instanceId && item.instanceId.length > 0) {
    return item.instanceId;
  }
  const cardInst =
    item.card && typeof item.card.instanceId === "string"
      ? item.card.instanceId
      : null;
  return cardInst && cardInst.length > 0 ? cardInst : null;
}

export function ensurePermanentVersion(item: PermanentItem): number {
  const raw = item.version;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export function normalizePermanentItem(
  item: PermanentItem | null | undefined
): PermanentItem | null {
  if (!item) return null;

  // Special case: Preserve removal markers even without a card field
  // These are used by mergeArrayByInstanceId to remove permanents
  const itemRecord = item as Record<string, unknown>;
  if (itemRecord.__remove === true && itemRecord.instanceId) {
    return item as PermanentItem;
  }

  // Skip items with undefined/null cards (malformed data from server)
  if (!item.card) {
    console.warn("[normalizePermanentItem] Skipping item with undefined card", item);
    return null;
  }
  const card = ensureCardInstanceId(item.card);
  if (!card) return null; // Card normalization failed
  let instanceId = item.instanceId;
  if (!instanceId || instanceId.length === 0) {
    instanceId = card.instanceId ?? newPermanentInstanceId();
  }
  const tapVersion =
    typeof item.tapVersion === "number" && Number.isFinite(item.tapVersion)
      ? item.tapVersion
      : 0;
  const version = ensurePermanentVersion(item);
  return {
    ...item,
    card,
    instanceId,
    tapVersion,
    version,
  };
}

export function normalizePermanentsRecord(
  per: Permanents | undefined
): Permanents | undefined {
  if (!per) return per;
  const result: Permanents = {};
  for (const [cell, list] of Object.entries(per)) {
    if (!Array.isArray(list)) {
      result[cell] = [];
      continue;
    }
    const normalizedList: PermanentItem[] = [];
    for (const entry of list) {
      const normalized = normalizePermanentItem(entry);
      if (normalized) normalizedList.push(normalized);
    }
    result[cell] = normalizedList;
  }
  return result;
}

export function bumpPermanentVersion<T extends PermanentItem>(
  item: T,
  inc = 1
): T {
  const nextVersion = ensurePermanentVersion(item) + inc;
  return { ...item, version: nextVersion } as T;
}
