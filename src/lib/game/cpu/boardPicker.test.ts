import { beforeEach, describe, expect, it } from "vitest";
import { useCpuBoardPicker } from "./boardPicker";

/**
 * Regression cover for the board-death bug.
 *
 * A pick used to be acknowledged by configuring the store under a throwaway `:ack:` request,
 * which hard-reset it to an empty token list. Re-arming then relied on the caller's React
 * state changing — but a REFUSED pick (the mulligan's 4th card, a chooseTargets past `count`)
 * returns the identical array, React bails out of the render, and nothing ever reconfigured.
 * The board was left permanently unclickable.
 */
describe("board picker", () => {
  beforeEach(() => useCpuBoardPicker.getState().clear(useCpuBoardPicker.getState().request));

  it("keeps the armed tokens when a pick is acknowledged", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("engine-mulligan:", ["hand:p1:a", "hand:p1:b", "hand:p1:c"]);
    picker.setGlow("engine-mulligan:", ["hand:p1:a"]);
    picker.select("hand:p1:b");
    expect(useCpuBoardPicker.getState().selected).toBe("hand:p1:b");

    useCpuBoardPicker.getState().deselect("engine-mulligan:");

    const after = useCpuBoardPicker.getState();
    expect(after.selected).toBeNull();
    // the whole point: the board is still live and still glowing
    expect(after.tiles).toEqual(["hand:p1:a", "hand:p1:b", "hand:p1:c"]);
    expect(after.glow).toEqual(["hand:p1:a"]);
    expect(after.request).toBe("engine-mulligan:");
  });

  it("lets the same token be picked again after a refused pick", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("req", ["t1", "t2"]);
    picker.select("t1");
    useCpuBoardPicker.getState().deselect("req");
    // the subscriber ignores a selection equal to the previous one, so clearing it is what
    // makes a second click on the SAME token observable
    useCpuBoardPicker.getState().select("t1");
    expect(useCpuBoardPicker.getState().selected).toBe("t1");
  });

  it("ignores a deselect aimed at someone else's request", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("mine", ["t1"]);
    picker.select("t1");
    useCpuBoardPicker.getState().deselect("someone-else");
    expect(useCpuBoardPicker.getState().selected).toBe("t1");
  });
});
