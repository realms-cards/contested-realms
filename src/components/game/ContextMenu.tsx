"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/game/store";

interface ContextMenuProps {
  onClose: () => void;
}

export default function ContextMenu({ onClose }: ContextMenuProps) {
  const contextMenu = useGameStore((s) => s.contextMenu);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const toggleTapSite = useGameStore((s) => s.toggleTapSite);
  const toggleTapPermanent = useGameStore((s) => s.toggleTapPermanent);
  const toggleTapAvatar = useGameStore((s) => s.toggleTapAvatar);
  const moveSiteToZone = useGameStore((s) => s.moveSiteToZone);
  const movePermanentToZone = useGameStore((s) => s.movePermanentToZone);
  const transferSiteControl = useGameStore((s) => s.transferSiteControl);
  const transferPermanentControl = useGameStore((s) => s.transferPermanentControl);
  
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setMenuPos(null);
      return;
    }
    
    const margin = 8;
    const sx = contextMenu.screen?.x ?? window.innerWidth / 2;
    const sy = contextMenu.screen?.y ?? window.innerHeight / 2;
    
    const compute = () => {
      const el = menuRef.current;
      const w = el?.offsetWidth ?? 224;
      const h = el?.offsetHeight ?? 200;
      const maxLeft = Math.max(margin, window.innerWidth - w - margin);
      const maxTop = Math.max(margin, window.innerHeight - h - margin);
      const left = Math.min(Math.max(sx, margin), maxLeft);
      const top = Math.min(Math.max(sy, margin), maxTop);
      setMenuPos({ left, top });
    };
    
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [contextMenu]);

  if (!contextMenu) return null;

  const t = contextMenu.target;
  let header = "";
  let tapped = false;
  let doToggle: () => void = () => {};
  let doToHand: (() => void) | null = null;
  let doToGY: (() => void) | null = null;
  let doBanish: (() => void) | null = null;
  let doTransfer: (() => void) | null = null;
  let transferTo: 1 | 2 | null = null;

  if (t.kind === "site") {
    const key = `${t.x},${t.y}`;
    const site = board.sites[key];
    header = site?.card?.name || `Site #${t.y * board.size.w + t.x + 1}`;
    tapped = !!site?.tapped;
    doToggle = () => {
      toggleTapSite(t.x, t.y);
      onClose();
    };
    
    if (site) {
      transferTo = site.owner === 1 ? 2 : 1;
      doTransfer = () => {
        transferSiteControl(t.x, t.y);
        onClose();
      };
    }
    
    doToHand = () => {
      moveSiteToZone(t.x, t.y, "hand");
      onClose();
    };
    doToGY = () => {
      moveSiteToZone(t.x, t.y, "graveyard");
      onClose();
    };
    doBanish = () => {
      moveSiteToZone(t.x, t.y, "banished");
      onClose();
    };
  } else if (t.kind === "permanent") {
    const item = (permanents[t.at] || [])[t.index];
    header = item?.card?.name || "Permanent";
    tapped = !!item?.tapped;
    doToggle = () => {
      toggleTapPermanent(t.at, t.index);
      onClose();
    };
    
    if (item) {
      transferTo = item.owner === 1 ? 2 : 1;
      doTransfer = () => {
        transferPermanentControl(t.at, t.index);
        onClose();
      };
    }
    
    doToHand = () => {
      movePermanentToZone(t.at, t.index, "hand");
      onClose();
    };
    doToGY = () => {
      movePermanentToZone(t.at, t.index, "graveyard");
      onClose();
    };
    doBanish = () => {
      movePermanentToZone(t.at, t.index, "banished");
      onClose();
    };
  } else if (t.kind === "avatar") {
    const a = avatars[t.who];
    header = a?.card?.name || `${t.who.toUpperCase()} Avatar`;
    tapped = !!a?.tapped;
    doToggle = () => {
      toggleTapAvatar(t.who);
      onClose();
    };
  }

  const label = tapped ? "Untap" : "Tap";

  return (
    <div
      className="absolute inset-0 z-30"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="absolute bg-zinc-900/90 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg p-3 w-56 text-white pointer-events-auto"
        style={{
          left: (menuPos?.left ?? contextMenu.screen?.x ?? 16) + "px",
          top: (menuPos?.top ?? contextMenu.screen?.y ?? 16) + "px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-sm font-semibold mb-2 truncate" title={header}>
            {header}
          </div>
          <div className="space-y-2">
            <button
              className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
              onClick={doToggle}
            >
              {label}
            </button>
            
            {doTransfer && (
              <button
                className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                onClick={doTransfer}
              >
                {`Transfer control${transferTo ? ` to P${transferTo}` : ""}`}
              </button>
            )}
            
            {(doToHand || doToGY || doBanish) && (
              <div className="space-y-2">
                {doToHand && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doToHand}
                  >
                    Move to Hand
                  </button>
                )}
                {doToGY && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doToGY}
                  >
                    Move to Cemetery
                  </button>
                )}
                {doBanish && (
                  <button
                    className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    onClick={doBanish}
                  >
                    Banish Card
                  </button>
                )}
              </div>
            )}
            
            <button
              className="w-full text-left rounded bg-white/5 hover:bg-white/15 px-3 py-1"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}