import { describe, it, expect, beforeEach } from 'vitest';
import { createGameStore, type CardRef, type PermanentItem } from '@/lib/game/store';

function makeArtifact(name: string, instanceId: string, owner: 1 | 2 = 1): PermanentItem {
  const card: CardRef = {
    cardId: Math.floor(Math.random() * 100000) + 1,
    name,
    variantId: null,
  };
  return {
    owner,
    card,
    instanceId,
    offset: null,
    tapped: false,
    tilt: 0,
    tapVersion: 0,
    version: 0,
    attachedTo: null,
    counters: null,
  } as unknown as PermanentItem;
}

function countByInstanceId(items: PermanentItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const id = (it.instanceId || it.card?.instanceId || '') as string;
    if (!id) continue;
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}

describe('Avatar attachments: moving avatar should not duplicate attached artifacts', () => {
  const oldKey = '1,1';
  const newKey = '2,1';

  it('moves avatar-attached artifact to new tile without duplication', () => {
    const store = createGameStore();

    // Seed minimal board and avatar position
    store.setState({
      board: { size: { w: 5, h: 5 }, sites: {} as Record<string, unknown> } as any,
      avatars: {
        ...store.getState().avatars,
        p1: { ...(store.getState().avatars.p1 || {}), pos: [1, 1], offset: null, tapped: false },
      },
      permanents: {
        [oldKey]: [makeArtifact('Test Artifact', 'artifact-1', 1)],
        [newKey]: [],
      },
    } as any);

    // Attach artifact at old tile to avatar
    const s1 = store.getState();
    expect(s1.permanents[oldKey]).toHaveLength(1);
    s1.attachPermanentToAvatar(oldKey as any, 0, 'p1');

    // Sanity: now attached at old tile
    const s2 = store.getState();
    expect(s2.permanents[oldKey][0].attachedTo).toEqual({ at: oldKey, index: -1 });

    // Move avatar to new tile
    s2.moveAvatarTo('p1', 2, 1);

    const s3 = store.getState();
    const oldList = s3.permanents[oldKey] || [];
    const newList = s3.permanents[newKey] || [];

    // The artifact should no longer be on the old tile
    expect(oldList.find((it) => (it.instanceId || it.card?.instanceId) === 'artifact-1')).toBeUndefined();

    // The artifact should appear exactly once on the new tile, attached to avatar
    const matches = newList.filter((it) => (it.instanceId || it.card?.instanceId) === 'artifact-1');
    expect(matches).toHaveLength(1);
    expect(matches[0].attachedTo).toEqual({ at: newKey, index: -1 });

    // No duplicates by instanceId on the destination tile
    const counts = countByInstanceId(newList as any);
    expect(counts['artifact-1']).toBe(1);
  });

  it('subsequent moves still preserve single instance of the attached artifact', () => {
    const store = createGameStore();

    // Seed: avatar at oldKey with attached artifact
    store.setState({
      board: { size: { w: 5, h: 5 }, sites: {} as Record<string, unknown> } as any,
      avatars: {
        ...store.getState().avatars,
        p1: { ...(store.getState().avatars.p1 || {}), pos: [1, 1], offset: null, tapped: false },
      },
      permanents: {
        [oldKey]: [makeArtifact('Test Artifact', 'artifact-2', 1)],
      },
    } as any);

    const s1 = store.getState();
    s1.attachPermanentToAvatar(oldKey as any, 0, 'p1');

    // Move to newKey, then to a third tile
    store.getState().moveAvatarTo('p1', 2, 1);
    store.getState().moveAvatarTo('p1', 0, 1);

    const sFinal = store.getState();
    const k3 = '0,1';
    const list3 = sFinal.permanents[k3] || [];

    // Only one instance of artifact-2 exists on the final tile and remains attached to avatar
    const matches = list3.filter((it) => (it.instanceId || it.card?.instanceId) === 'artifact-2');
    expect(matches).toHaveLength(1);
    expect(matches[0].attachedTo).toEqual({ at: k3, index: -1 });
  });
});
