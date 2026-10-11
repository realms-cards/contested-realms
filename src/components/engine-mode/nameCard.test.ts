import { describe, expect, it } from "vitest";
import { nameCardMode, type PromptData } from "./EnginePromptPanel";

/**
 * Ten of the engine's twelve nameCard sites hand us a list; only Feast for Crows and Hyter
 * Sprites are free-form. The mode decides whether the player gets a cancel, and a wrong
 * answer here is a soft-lock: Legion of Gall's continuation re-asks with its state unchanged
 * on any non-string, and four other sites pass the answer straight to a getCard that throws
 * on "".
 */
describe("nameCard mode", () => {
  it("treats a supplied list as constrained, however short", () => {
    expect(nameCardMode({ names: ["Pollimorph", "Vivien the Enchantress"] } as PromptData)).toBe("list");
    expect(nameCardMode({ names: ["Only One"] } as PromptData)).toBe("list");
  });

  it("treats an EMPTY list as constrained too, not free-form", () => {
    // presence of the key, not truthiness: an empty list is still the engine constraining us,
    // and falling through to the free-form branch would hand back the cancel that loops Gall
    expect(nameCardMode({ names: [] } as PromptData)).toBe("list");
  });

  it("is free-form only when the engine supplied no list at all", () => {
    expect(nameCardMode({} as PromptData)).toBe("free");
    expect(nameCardMode({ options: ["a"] } as PromptData)).toBe("free");
  });

  it("does not mistake a non-array for a list", () => {
    expect(nameCardMode({ names: undefined } as PromptData)).toBe("free");
  });
});
