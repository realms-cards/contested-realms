import { describe, expect, it, vi } from "vitest";

import { createFeatureRegistry } from "../../../server/core/featureRegistry";

describe("feature registry", () => {
  it("registers features and applies socket handlers", () => {
    const registry = createFeatureRegistry<{ value: number }>();
    const handler = vi.fn();

    registry.registerFeature(
      "demo",
      () => ({
        registerSocketHandlers: handler,
      }),
      {}
    );

    registry.applyConnectionHandlers({ value: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
    expect(registry.getFeature("demo")).toBeDefined();
    expect(registry.listFeatures()).toEqual(["demo"]);
  });
});
