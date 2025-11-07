const INSTANCE_PREFIX = Math.random().toString(36).slice(2, 6);
let permanentInstanceSeq = 0;
let cardInstanceSeq = 0;

export const newPermanentInstanceId = (): string =>
  `perm_${INSTANCE_PREFIX}_${Date.now().toString(36)}_${permanentInstanceSeq++}`;

export const newZoneCardInstanceId = (): string =>
  `card_${INSTANCE_PREFIX}_${Date.now().toString(36)}_${cardInstanceSeq++}`;
