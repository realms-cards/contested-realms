import { useEffect } from "react";
import type { StoreApi, UseBoundStore } from "zustand";

import type { GameState } from "@/lib/game/store";

type UseTTSHotkeysOptions = {
  store: UseBoundStore<StoreApi<GameState>>;
  isSpectator: boolean;
  overlayBlocking: boolean;
  playCardFlip: () => void;
};

const isTextInput = (element: HTMLElement | null): boolean => {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || element.isContentEditable === true
  );
};

/**
 * TTS-mode specific hotkeys. Only active when controlScheme === "tts".
 * - F: Tap/untap selected permanent or avatar (mirrors TTS flip)
 * - H: Toggle hand visibility
 * - Escape: Clear marquee selection
 * - ALT held: Show card preview for hovered card
 */
export function useTTSHotkeys({
  store,
  isSpectator,
  overlayBlocking,
  playCardFlip,
}: UseTTSHotkeysOptions) {
  // F key: tap/untap (TTS "flip" equivalent)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { controlScheme } = store.getState();
      if (controlScheme !== "tts") return;
      if (event.repeat) return;
      if (event.code !== "KeyF") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) return;
      if (isSpectator || overlayBlocking) return;

      const {
        selectedPermanent,
        selectedAvatar,
        permanents,
        toggleTapPermanent,
        toggleTapAvatar,
        closeContextMenu,
      } = store.getState();

      let tapped = false;
      if (selectedPermanent) {
        const { at, index } = selectedPermanent;
        const items = permanents[at];
        if (items && items[index]) {
          event.preventDefault();
          toggleTapPermanent(at, index);
          tapped = true;
        }
      } else if (selectedAvatar) {
        event.preventDefault();
        toggleTapAvatar(selectedAvatar);
        tapped = true;
      }

      if (tapped) {
        try {
          playCardFlip();
        } catch {}
        closeContextMenu();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, isSpectator, overlayBlocking, playCardFlip]);

  // H key: toggle hand visibility
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { controlScheme } = store.getState();
      if (controlScheme !== "tts") return;
      if (event.repeat) return;
      if (event.code !== "KeyH") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) return;

      event.preventDefault();
      store.getState().toggleHandVisibility();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // Escape: clear marquee selection
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { controlScheme, marqueeSelection } = store.getState();
      if (controlScheme !== "tts") return;
      if (event.key !== "Escape") return;
      if (marqueeSelection.length === 0) return;

      event.preventDefault();
      store.getState().clearMarqueeSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // F key: also tap/untap all marquee-selected permanents
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { controlScheme, marqueeSelection } = store.getState();
      if (controlScheme !== "tts") return;
      if (event.repeat) return;
      if (event.code !== "KeyF") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) return;
      if (isSpectator || overlayBlocking) return;
      if (marqueeSelection.length === 0) return;

      // If there's a marquee selection, tap/untap all of them
      event.preventDefault();
      const { permanents, toggleTapPermanent, closeContextMenu } =
        store.getState();
      let anyTapped = false;
      for (const { at, index } of marqueeSelection) {
        const items = permanents[at];
        if (items && items[index]) {
          toggleTapPermanent(at, index);
          anyTapped = true;
        }
      }
      if (anyTapped) {
        try {
          playCardFlip();
        } catch {}
        closeContextMenu();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, isSpectator, overlayBlocking, playCardFlip]);
}
