import { beforeEach, describe, expect, it, vi } from "vitest";

type HoverCard = {
  slug: string;
  name: string;
  type: string | null;
};

type TrackerCard = {
  id: number;
  slug: string;
  name: string;
  type: string | null;
  x: number;
  z: number;
};

type Viewport = {
  width: number;
  height: number;
};

class MockMouseTracker {
  private cards: TrackerCard[];
  private onHover: (card: HoverCard | null) => void;
  private viewport: Viewport;
  private currentSlug: string | null = null;
  private readonly worldScale = 4; // Arbitrary scale to convert normalized space to world space

  constructor(options: { cards: TrackerCard[]; onHover: (card: HoverCard | null) => void; viewport?: Viewport }) {
    this.cards = options.cards;
    this.onHover = options.onHover;
    this.viewport = options.viewport ?? { width: 800, height: 600 };
  }

  updateMousePosition(clientX: number, clientY: number): void {
    const normalizedX = (clientX / this.viewport.width) * 2 - 1;
    const normalizedY = -((clientY / this.viewport.height) * 2 - 1);

    const worldX = normalizedX * this.worldScale;
    const worldZ = normalizedY * this.worldScale;

    const intersections = this.cards
      .map((card) => {
        const distance = Math.hypot(card.x - worldX, card.z - worldZ);
        return { card, distance };
      })
      .filter(({ distance }) => distance <= 1.25)
      .sort((a, b) => a.distance - b.distance);

    if (intersections.length === 0) {
      if (this.currentSlug !== null) {
        this.currentSlug = null;
        this.onHover(null);
      }
      return;
    }

    const top = intersections[0].card;
    if (top.slug === this.currentSlug) {
      return;
    }

    this.currentSlug = top.slug;
    this.onHover({ slug: top.slug, name: top.name, type: top.type });
  }
}

describe("MouseTracker hover detection", () => {
  let cards: TrackerCard[];
  const viewport = { width: 800, height: 600 };

  beforeEach(() => {
    cards = [
      { id: 1, slug: "p1", name: "Player One", type: "Creature", x: 0, z: 0 },
      { id: 2, slug: "p2", name: "Player Two", type: "Spell", x: 2, z: 0 },
      { id: 3, slug: "p3", name: "Player Three", type: null, x: 0, z: 2 },
    ];
  });

  it("reports the closest card under the cursor", () => {
    const onHover = vi.fn();
    const tracker = new MockMouseTracker({ cards, onHover, viewport });

    tracker.updateMousePosition(400, 300); // Center -> card at (0,0)

    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith({ slug: "p1", name: "Player One", type: "Creature" });
  });

  it("clears the hover when nothing is under the cursor", () => {
    const onHover = vi.fn();
    const tracker = new MockMouseTracker({ cards, onHover, viewport });

    tracker.updateMousePosition(400, 300); // Hover first card
    tracker.updateMousePosition(50, 50); // Far away -> should clear

    expect(onHover).toHaveBeenNthCalledWith(1, { slug: "p1", name: "Player One", type: "Creature" });
    expect(onHover).toHaveBeenNthCalledWith(2, null);
  });

  it("avoids emitting duplicate hover events for the same card", () => {
    const onHover = vi.fn();
    const tracker = new MockMouseTracker({ cards, onHover, viewport });

    tracker.updateMousePosition(400, 300);
    tracker.updateMousePosition(405, 305); // Slight movement, still same card
    tracker.updateMousePosition(395, 295);

    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it("switches hover when another card becomes closer", () => {
    const onHover = vi.fn();
    const tracker = new MockMouseTracker({ cards, onHover, viewport });

    tracker.updateMousePosition(400, 300); // Card p1
    tracker.updateMousePosition(600, 300); // Closer to card p2

    expect(onHover).toHaveBeenNthCalledWith(1, { slug: "p1", name: "Player One", type: "Creature" });
    expect(onHover).toHaveBeenNthCalledWith(2, { slug: "p2", name: "Player Two", type: "Spell" });
  });
});
