import type { ComponentProps } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, it, expect, vi } from "vitest";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";

vi.mock("@/lib/game/components/CardPlane", () => ({
  __esModule: true,
  default: () => null,
}));

type DraggableCard3DProps = ComponentProps<typeof DraggableCard3D>;

describe("DraggableCard3D raycast and hover behaviour", () => {
  const baseProps: DraggableCard3DProps = {
    slug: "test-card",
    isSite: false,
    x: 1.23,
    z: -4.56,
    y: 0.002,
    cardId: 42,
    cardName: "Test Card",
    cardType: "Spell",
    baseRenderOrder: 1500,
  };

  const createRenderer = (props?: Partial<DraggableCard3DProps>) =>
    TestRenderer.create(<DraggableCard3D {...baseProps} {...props} />);

  it("attaches hitbox metadata via userData and leaves raycast untouched", () => {
    const renderer = createRenderer();
    const mesh = renderer.root.find((node) => node.type === "mesh");

    expect(mesh.props.raycast).toBeUndefined();
    expect(mesh.props.userData).toMatchObject({
      cardId: 42,
      slug: "test-card",
      type: "Spell",
      name: "Test Card",
    });
  });

  it("publishes CardPreviewData through hover callbacks", () => {
    const onHoverStart = vi.fn();
    const onHoverEnd = vi.fn();
    const onHoverChange = vi.fn();

    const renderer = createRenderer({ onHoverStart, onHoverEnd, onHoverChange });
    const mesh = renderer.root.find((node) => node.type === "mesh");

    act(() => {
      mesh.props.onPointerOver?.();
    });

    expect(onHoverChange).toHaveBeenCalledWith(true);
    expect(onHoverStart).toHaveBeenCalledTimes(1);
    expect(onHoverStart).toHaveBeenCalledWith({
      slug: "test-card",
      name: "Test Card",
      type: "Spell",
    });

    vi.useFakeTimers();
    try {
      act(() => {
        mesh.props.onPointerOut?.();
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(onHoverChange).toHaveBeenLastCalledWith(false);
      expect(onHoverEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});