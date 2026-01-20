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

  it('does not copy artifacts between avatars when both occupy the same tile', () => {
    const store = createGameStore();
    const sharedTile = '2,2';
    const p1StartTile = '1,2';
    const p2EndTile = '3,2';

    // Setup: P1 avatar at sharedTile with artifact, P2 avatar at sharedTile without artifact
    store.setState({
      board: { size: { w: 5, h: 5 }, sites: {} as Record<string, unknown> } as any,
      avatars: {
        p1: { pos: [2, 2], offset: null, tapped: false, card: null },
        p2: { pos: [2, 2], offset: null, tapped: false, card: null },
      },
      permanents: {
        [sharedTile]: [
          // P1's artifact attached to avatar (owner: 1)
          { ...makeArtifact('Meat Hook', 'p1-meathook', 1), attachedTo: { at: sharedTile, index: -1 } },
          // P2's artifact attached to avatar (owner: 2)
          { ...makeArtifact('The Rack', 'p2-rack', 2), attachedTo: { at: sharedTile, index: -1 } },
        ],
      },
    } as any);

    const s1 = store.getState();
    const initialPerms = s1.permanents[sharedTile];
    expect(initialPerms).toHaveLength(2);

    // When P2 moves away from the shared tile
    s1.moveAvatarTo('p2', 3, 2);

    const s2 = store.getState();
    const sharedTilePerms = s2.permanents[sharedTile] || [];
    const p2EndPerms = s2.permanents[p2EndTile] || [];

    // P1's artifact should stay at the shared tile (P1 is still there)
    const p1ArtifactsAtShared = sharedTilePerms.filter(
      (p) => p.owner === 1 && p.attachedTo?.index === -1
    );
    expect(p1ArtifactsAtShared).toHaveLength(1);
    expect(p1ArtifactsAtShared[0].instanceId).toBe('p1-meathook');

    // P2's artifact should have moved to P2's new tile
    const p2ArtifactsAtEnd = p2EndPerms.filter(
      (p) => p.owner === 2 && p.attachedTo?.index === -1
    );
    expect(p2ArtifactsAtEnd).toHaveLength(1);
    expect(p2ArtifactsAtEnd[0].instanceId).toBe('p2-rack');

    // P1's artifact should NOT be at P2's new tile (no copying)
    const p1ArtifactsAtP2End = p2EndPerms.filter((p) => p.owner === 1);
    expect(p1ArtifactsAtP2End).toHaveLength(0);

    // P2's artifact should NOT remain at shared tile (it moved with P2)
    const p2ArtifactsAtShared = sharedTilePerms.filter((p) => p.owner === 2);
    expect(p2ArtifactsAtShared).toHaveLength(0);
  });

  it('does not copy artifacts when avatar moves to a tile occupied by opponent avatar', () => {
    const store = createGameStore();
    const p1Tile = '1,1';
    const p2Tile = '2,1';

    // Setup: P1 at (1,1) with artifact, P2 at (2,1) with artifact
    store.setState({
      board: { size: { w: 5, h: 5 }, sites: {} as Record<string, unknown> } as any,
      avatars: {
        p1: { pos: [1, 1], offset: null, tapped: false, card: null },
        p2: { pos: [2, 1], offset: null, tapped: false, card: null },
      },
      permanents: {
        [p1Tile]: [
          { ...makeArtifact('P1 Artifact', 'p1-art', 1), attachedTo: { at: p1Tile, index: -1 } },
        ],
        [p2Tile]: [
          { ...makeArtifact('P2 Artifact', 'p2-art', 2), attachedTo: { at: p2Tile, index: -1 } },
        ],
      },
    } as any);

    // P1 moves to P2's tile
    store.getState().moveAvatarTo('p1', 2, 1);

    const s2 = store.getState();
    const p2TilePerms = s2.permanents[p2Tile] || [];

    // Both artifacts should now be at P2's tile, but each owned by their respective player
    expect(p2TilePerms).toHaveLength(2);

    const p1Arts = p2TilePerms.filter((p) => p.owner === 1);
    const p2Arts = p2TilePerms.filter((p) => p.owner === 2);

    expect(p1Arts).toHaveLength(1);
    expect(p1Arts[0].instanceId).toBe('p1-art');
    expect(p2Arts).toHaveLength(1);
    expect(p2Arts[0].instanceId).toBe('p2-art');
  });
});
