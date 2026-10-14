import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/** Where and with what a press happened; `pointerType` is "" for a keyboard click. */
export interface PressInfo {
  x: number;
  y: number;
  pointerType: string;
}

export interface LongPressOptions {
  onTap?: (info: PressInfo) => void;
  onLongPress?: (info: PressInfo) => void;
  /** ms a finger has to stay down */
  delay?: number;
  /** px a finger may drift before the press counts as a scroll */
  tolerance?: number;
}

export const LONG_PRESS_MS = 450;
const DRIFT_PX = 10;

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The press state machine behind useLongPress, free of React so it can be tested on its own.
 *
 * A primary press held for `delay` without drifting is a long press; a right-click is one too
 * (that is the desktop's long press). Whatever fired the long press also swallows the click
 * that follows, and the press after it starts clean. A click with no press before it (Enter on
 * a focused card) is an ordinary tap.
 */
export function createLongPress(getOptions: () => LongPressOptions, timers: Timers = realTimers) {
  let timer: unknown = null;
  let start: PressInfo | null = null;
  let fired = false;
  let drifted = false;
  let lastType = "";

  const stop = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  return {
    down(info: PressInfo, primary: boolean) {
      stop();
      fired = false;
      drifted = false;
      lastType = info.pointerType;
      start = info;
      if (!primary) return;
      const { delay = LONG_PRESS_MS } = getOptions();
      timer = timers.set(() => {
        timer = null;
        fired = true;
        if (start) getOptions().onLongPress?.(start);
      }, delay);
    },
    move(x: number, y: number) {
      if (!start || timer === null) return;
      const { tolerance = DRIFT_PX } = getOptions();
      if (Math.hypot(x - start.x, y - start.y) > tolerance) {
        drifted = true;
        stop();
      }
    },
    up() {
      stop();
    },
    cancel() {
      stop();
      start = null;
    },
    /** The browser's context menu: a right-click, or a touch long-press some browsers report. */
    contextMenu(info: PressInfo) {
      stop();
      if (fired) return; // the timer already opened it
      fired = true;
      getOptions().onLongPress?.(info);
    },
    click(info: PressInfo) {
      const swallow = fired || drifted;
      fired = false;
      drifted = false;
      const pointerType = info.pointerType || lastType;
      lastType = "";
      start = null;
      if (swallow) return;
      getOptions().onTap?.({ ...info, pointerType });
    },
    dispose() {
      stop();
    },
  };
}

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onClick: (e: ReactMouseEvent) => void;
}

const pointerTypeOf = (e: ReactMouseEvent): string => {
  const native = e.nativeEvent as MouseEvent & { pointerType?: string };
  return typeof native.pointerType === "string" ? native.pointerType : "";
};

/**
 * Tap and long-press (450ms) for one element, for touch and mouse alike: a right-click is the
 * mouse's long press. The element should also carry `select-none [-webkit-touch-callout:none]`
 * so iOS does not raise its own callout over the menu.
 */
export function useLongPress(options: LongPressOptions): LongPressHandlers {
  const latest = useRef(options);
  latest.current = options;
  const press = useMemo(() => createLongPress(() => latest.current), []);
  useEffect(() => () => press.dispose(), [press]);

  return useMemo(
    () => ({
      onPointerDown: (e) =>
        press.down({ x: e.clientX, y: e.clientY, pointerType: e.pointerType }, e.button === 0 && e.isPrimary),
      onPointerMove: (e) => press.move(e.clientX, e.clientY),
      onPointerUp: () => press.up(),
      onPointerCancel: () => press.cancel(),
      onPointerLeave: () => press.up(),
      onContextMenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        press.contextMenu({ x: e.clientX, y: e.clientY, pointerType: pointerTypeOf(e) });
      },
      onClick: (e) => {
        e.stopPropagation();
        press.click({ x: e.clientX, y: e.clientY, pointerType: pointerTypeOf(e) });
      },
    }),
    [press],
  );
}
