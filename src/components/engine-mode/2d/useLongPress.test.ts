import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLongPress, LONG_PRESS_MS } from "./useLongPress";
import type { PressInfo } from "./useLongPress";

const touch = (x = 10, y = 10): PressInfo => ({ x, y, pointerType: "touch" });
const mouse = (x = 10, y = 10): PressInfo => ({ x, y, pointerType: "mouse" });

function setup() {
  const onTap = vi.fn();
  const onLongPress = vi.fn();
  const press = createLongPress(() => ({ onTap, onLongPress }));
  return { press, onTap, onLongPress };
}

describe("createLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a quick press is a tap, with the pointer type of the press", () => {
    const { press, onTap, onLongPress } = setup();
    press.down(touch(), true);
    vi.advanceTimersByTime(100);
    press.up();
    press.click({ x: 10, y: 10, pointerType: "" });
    expect(onTap).toHaveBeenCalledWith({ x: 10, y: 10, pointerType: "touch" });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("holding opens the long press once and swallows the click after it", () => {
    const { press, onTap, onLongPress } = setup();
    press.down(touch(5, 6), true);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledWith(touch(5, 6));
    press.contextMenu(touch(5, 6)); // Android reports the same long press as a context menu
    press.up();
    press.click(touch(5, 6));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
    // the next press starts clean
    press.down(touch(), true);
    press.up();
    press.click(touch());
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("a drifting finger is a scroll: no long press, no tap", () => {
    const { press, onTap, onLongPress } = setup();
    press.down(touch(0, 0), true);
    press.move(0, 30);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    press.up();
    press.click(touch(0, 30));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });

  it("a right-click is the mouse's long press and does not leave the next left click swallowed", () => {
    const { press, onTap, onLongPress } = setup();
    press.down(mouse(), false);
    press.contextMenu(mouse(3, 4));
    expect(onLongPress).toHaveBeenCalledWith(mouse(3, 4));
    press.down(mouse(), true);
    press.up();
    press.click(mouse());
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("a keyboard click with no press before it is a tap", () => {
    const { press, onTap } = setup();
    press.click({ x: 0, y: 0, pointerType: "" });
    expect(onTap).toHaveBeenCalledWith({ x: 0, y: 0, pointerType: "" });
  });
});
