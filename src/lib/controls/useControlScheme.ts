import { useMemo } from "react";
import type { GameState } from "@/lib/game/store";

type ControlSchemeInfo = {
  scheme: GameState["controlScheme"];
  isTTS: boolean;
  isDefault: boolean;
  /**
   * In TTS mode, right-click is camera pan so context menus need Shift+click.
   * Returns true if the event should open a context menu.
   */
  shouldOpenContextMenu: (e: { button: number; shiftKey: boolean }) => boolean;
};

/**
 * Derives convenience booleans and helpers from the raw controlScheme value.
 * Accepts the scheme value directly so it works regardless of how the store
 * is accessed (passed store prop, direct hook, etc.).
 */
export function useControlScheme(
  scheme: GameState["controlScheme"],
): ControlSchemeInfo {
  return useMemo(() => {
    const isTTS = scheme === "tts";
    return {
      scheme,
      isTTS,
      isDefault: !isTTS,
      shouldOpenContextMenu: (e: { button: number; shiftKey: boolean }) => {
        if (isTTS) {
          // TTS: Shift + left-click opens context menu
          return e.button === 0 && e.shiftKey;
        }
        // Default: right-click (button 2) or native contextmenu event
        return e.button === 2;
      },
    };
  }, [scheme]);
}
