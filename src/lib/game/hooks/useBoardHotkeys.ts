import { useEffect } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import type { GameState } from "@/lib/game/store";

type UseBoardHotkeysOptions = {
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

export function useBoardHotkeys({
  store,
  isSpectator,
  overlayBlocking,
  playCardFlip,
}: UseBoardHotkeysOptions) {
  // Tap/untap shortcut (T)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "KeyT") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) {
        return;
      }
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

  // Delete/Backspace shortcut to banish selected token
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const isDelete =
        event.key === "Delete" ||
        event.key === "Backspace" ||
        event.code === "Delete" ||
        event.code === "Backspace";
      if (!isDelete) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) {
        return;
      }
      if (isSpectator || overlayBlocking) return;

      const {
        selectedPermanent,
        permanents,
        movePermanentToZone,
        closeContextMenu,
        clearSelection,
      } = store.getState();

      if (!selectedPermanent) return;

      const { at, index } = selectedPermanent;
      const items = permanents[at];
      const item = items?.[index];
      if (!item) return;

      const isToken = String(item.card?.type || "")
        .toLowerCase()
        .includes("token");
      if (!isToken) return;

      event.preventDefault();
      try {
        movePermanentToZone(at, index, "banished");
        try {
          playCardFlip();
        } catch {}
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[board] Failed to banish token via keyboard:", err);
        }
      }
      closeContextMenu();
      clearSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, isSpectator, overlayBlocking, playCardFlip]);

  // End turn shortcut (Enter)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const isEnter =
        event.key === "Enter" ||
        event.code === "Enter" ||
        event.code === "NumpadEnter";
      if (!isEnter) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) {
        return;
      }
      if (isSpectator || overlayBlocking) return;

      const { matchEnded, phase, actorKey, currentPlayer, requestEndTurn } =
        store.getState();
      if (matchEnded || phase === "Setup") return;
      const seat = actorKey === "p1" ? 1 : actorKey === "p2" ? 2 : null;
      if (seat == null || seat !== currentPlayer) return;

      event.preventDefault();
      try {
        requestEndTurn();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[board] Failed to end turn via keyboard:", err);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, isSpectator, overlayBlocking]);

  // Spawn gem token at cursor shortcut (G)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "KeyG") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextInput(document.activeElement as HTMLElement | null)) {
        return;
      }
      if (isSpectator || overlayBlocking) return;

      const { actorKey, lastPointerWorldPos, spawnGemTokenAt } =
        store.getState();
      if (!actorKey) return;

      event.preventDefault();

      // Spawn at cursor position if available, otherwise at a default position
      const pos = lastPointerWorldPos ?? { x: 0, z: 0 };
      try {
        spawnGemTokenAt("red", actorKey, { x: pos.x, y: 0, z: pos.z });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[board] Failed to spawn gem via keyboard:", err);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, isSpectator, overlayBlocking]);
}
