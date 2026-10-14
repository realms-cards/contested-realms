import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardViewPreference } from "@/hooks/useGraphicsSettings";
import {
  BOARD_VIEW_DEBOUNCE_MS,
  resolveBoardView,
  useResolvedBoardView,
} from "./boardView";

const mouse = (width: number, height: number) => ({ width, height, coarsePointer: false });
const touch = (width: number, height: number) => ({ width, height, coarsePointer: true });

describe("resolveBoardView", () => {
  it("honours an explicit choice on any device", () => {
    expect(resolveBoardView("3d", touch(390, 844))).toBe("3d");
    expect(resolveBoardView("2d", mouse(1920, 1080))).toBe("2d");
  });

  it("auto picks 2D for phones in either orientation", () => {
    expect(resolveBoardView("auto", touch(390, 844))).toBe("2d");
    expect(resolveBoardView("auto", touch(844, 390))).toBe("2d");
    expect(resolveBoardView("auto", touch(932, 430))).toBe("2d");
    expect(resolveBoardView("auto", touch(360, 640))).toBe("2d");
    expect(resolveBoardView("auto", touch(600, 960))).toBe("2d"); // short side exactly 600
  });

  it("auto keeps tablets and desktops on 3D", () => {
    expect(resolveBoardView("auto", touch(768, 1024))).toBe("3d");
    expect(resolveBoardView("auto", touch(1024, 768))).toBe("3d");
    expect(resolveBoardView("auto", touch(960, 601))).toBe("3d"); // short side just over 600
    expect(resolveBoardView("auto", mouse(1440, 900))).toBe("3d");
    // a short but wide mouse window is not a phone
    expect(resolveBoardView("auto", mouse(1200, 500))).toBe("3d");
  });

  it("auto picks 2D for any window narrower than 640px", () => {
    expect(resolveBoardView("auto", mouse(639, 900))).toBe("2d");
    expect(resolveBoardView("auto", mouse(640, 900))).toBe("3d");
  });

  it("treats an unrecognised stored value as auto", () => {
    const junk = "flat" as unknown as BoardViewPreference;
    expect(resolveBoardView(junk, touch(390, 844))).toBe("2d");
    expect(resolveBoardView(junk, mouse(1440, 900))).toBe("3d");
  });
});

/** In-memory Storage: Node's own `localStorage` global shadows jsdom's and is unusable here. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => {
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("useResolvedBoardView", () => {
  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    setViewport(1440, 900);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves after mount and follows the stored preference", () => {
    localStorage.setItem("sorcery-graphics-settings", JSON.stringify({ boardView: "2d" }));
    const { result } = renderHook(() => useResolvedBoardView());
    expect(result.current).toBe("2d");
  });

  it("re-decides after a resize, debounced", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useResolvedBoardView());
    expect(result.current).toBe("3d");

    act(() => {
      setViewport(500, 900);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe("3d"); // not yet: still settling

    act(() => {
      vi.advanceTimersByTime(BOARD_VIEW_DEBOUNCE_MS);
    });
    expect(result.current).toBe("2d");
  });
});
