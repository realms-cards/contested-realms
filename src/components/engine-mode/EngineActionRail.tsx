"use client";

import { useEffect, useState } from "react";
import CpuCardPick from "@/components/game/CpuCardPick";
import { RcButton } from "@/components/ui/rc-button";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { cardRefFor } from "@/lib/engine-mode/cardIndex";
import { localizeEngineText } from "@/lib/engine-mode/coords";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { useGameStore } from "@/lib/game/store";
import ActionSprite, { type ActionSpriteId } from "./ActionSprite";
import type { EngineInteraction } from "./useEngineInteraction";

/**
 * The vertical action rail: every action the player can take, as a pixel sprite, stacked
 * down the right edge under the mana/threshold readout.
 *
 * Availability still comes from the engine — `interaction` is derived from its legal moves,
 * and the handlers are the same ones the old text bar called. The sprites are presentation.
 */

const BUTTON =
  "pointer-events-auto relative grid h-10 w-10 place-items-center rounded-rc-md border bg-[rgba(7,10,20,0.88)] shadow-rc-panel transition-colors hover:border-rc-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring disabled:cursor-not-allowed disabled:opacity-40";
const QUIET = "border-rc-line/22";
const LIVE = "border-rc-accent/55";

/** One rail button: sprite, accessible label, optional live count. */
function RailButton({
  id,
  label,
  onClick,
  tone = "quiet",
  looping = false,
  count,
  pressed,
  disabled,
}: {
  id: ActionSpriteId;
  label: string;
  onClick: () => void;
  tone?: "quiet" | "live";
  looping?: boolean;
  count?: number;
  pressed?: boolean;
  disabled?: boolean;
}) {
  // a one-shot replays on hover and whenever the state id itself changes
  const [hovered, setHovered] = useState(0);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHovered((n) => n + 1)}
      className={`${BUTTON} ${tone === "live" ? LIVE : QUIET}`}
    >
      <ActionSprite id={id} playKey={`${id}:${hovered}`} looping={looping} />
      {count !== undefined && count > 0 && (
        <span className="absolute bottom-0 right-0 min-w-[16px] rounded-rc-sm bg-[rgba(7,10,20,0.95)] px-0.5 text-center font-rc-mono text-[10px] leading-4 tabular-nums text-rc-fg ring-1 ring-rc-line/30">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

export default function EngineActionRail({
  interaction,
  onExit,
}: {
  interaction: EngineInteraction;
  onExit: () => void;
}) {
  const game = useEngineSession((s) => s.game);
  useEngineSession((s) => s.rev);
  const canUndo = useEngineSession((s) => s.canUndo);
  const dispatch = useEngineSession((s) => s.dispatch);
  const undo = useEngineSession((s) => s.undo);
  const layer = useEngineSession((s) => s.layer);
  const setLayer = useEngineSession((s) => s.setLayer);
  const collection = useGameStore((s) => s.zones.p1?.collection);
  const [music, musicControls] = useMusicPlayer();

  const [logOpen, setLogOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [cemeteryOpen, setCemeteryOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [concedeArmed, setConcedeArmed] = useState(false);
  const [rolls, setRolls] = useState<string[]>([]);
  const [rngMax, setRngMax] = useState(20);

  // disarm the concede confirmation after a moment
  useEffect(() => {
    if (!concedeArmed) return;
    const timer = setTimeout(() => setConcedeArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [concedeArmed]);

  // Escape closes whatever the rail opened, like the rest of the mode's overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLogOpen(false);
      setToolsOpen(false);
      setCemeteryOpen(false);
      setCollectionOpen(false);
      setConcedeArmed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const roll = (label: string, max: number) => {
    const result = `${label}: ${1 + Math.floor(Math.random() * max)}`;
    setRolls((r) => [result, ...r].slice(0, 5));
    try {
      window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: `You rolled ${result}` } }));
    } catch {}
  };

  if (!game) return null;
  const myTurn = game.activePlayer === HUMAN_SEAT;
  const myMain = myTurn && game.phase === "main" && game.prompts.length === 0;
  const over = game.phase === "over";
  const log = game.log.slice(-40);
  const pool = collection ?? [];

  return (
    <>
      <div className="thin-scrollbar pointer-events-none flex max-h-[52vh] flex-col items-end gap-1.5 overflow-y-auto">
        {interaction.confirmable && <RailButton id="confirm" label="Confirm" tone="live" onClick={interaction.confirm} />}
        {interaction.picking && <RailButton id="cancel" label="Cancel this action" tone="live" onClick={interaction.cancel} />}
        {myMain && !interaction.confirmable && (
          <RailButton id="end-turn" label="End turn" tone="live" onClick={() => dispatch(interaction.endTurn ?? { t: "endTurn" })} />
        )}
        {canUndo && <RailButton id="undo" label="Undo" onClick={undo} />}
        {myMain && interaction.cemetery.length > 0 && (
          <RailButton
            id="cemetery"
            label={`Cast from your cemetery (${interaction.cemetery.length})`}
            looping={cemeteryOpen}
            count={interaction.cemetery.length}
            pressed={cemeteryOpen}
            onClick={() => setCemeteryOpen((o) => !o)}
          />
        )}
        {pool.length > 0 && (
          <RailButton
            id="collection"
            label={`Browse your collection (${pool.length})`}
            count={pool.length}
            pressed={collectionOpen}
            onClick={() => setCollectionOpen((o) => !o)}
          />
        )}

        <span aria-hidden className="my-0.5 h-px w-6 bg-rc-line/25" />

        <RailButton
          id={layer === "subsurface" ? "subsurface-on" : "subsurface-off"}
          label="Show burrowed and submerged units (V)"
          pressed={layer === "subsurface"}
          onClick={() => setLayer(layer === "surface" ? "subsurface" : "surface")}
        />
        <RailButton
          id={music.isPlaying ? "music" : "music-muted"}
          label={music.isPlaying ? "Pause music" : "Play music"}
          looping={music.isPlaying}
          pressed={music.isPlaying}
          onClick={musicControls.togglePlay}
        />
        <RailButton id="log" label="Event log" pressed={logOpen} onClick={() => setLogOpen((o) => !o)} />
        <RailButton id="tools" label="Table tools" pressed={toolsOpen} onClick={() => setToolsOpen((o) => !o)} />

        <span aria-hidden className="my-0.5 h-px w-6 bg-rc-line/25" />

        {!over && (
          <RailButton
            id={concedeArmed ? "concede-armed" : "concede"}
            label={concedeArmed ? "Really concede?" : "Concede"}
            looping={concedeArmed}
            tone={concedeArmed ? "live" : "quiet"}
            onClick={() => {
              if (!concedeArmed) return setConcedeArmed(true);
              setConcedeArmed(false);
              dispatch({ t: "concede" });
            }}
          />
        )}
        <RailButton id="leave" label="Leave the match" onClick={onExit} />
      </div>

      {toolsOpen && (
        <div className="pointer-events-auto fixed bottom-20 right-16 z-[160] flex w-[240px] flex-col gap-2 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 font-rc-sans text-sm text-rc-fg shadow-rc-panel">
          <div className="font-rc-mono text-xs uppercase tracking-[0.08em] text-rc-fg-subtle">Table tools</div>
          <div className="flex flex-wrap gap-1.5">
            <RcButton variant="outline" size="xs" onClick={() => roll("d20", 20)}>
              Roll d20
            </RcButton>
            <RcButton variant="outline" size="xs" onClick={() => roll("d6", 6)}>
              Roll d6
            </RcButton>
            <RcButton variant="outline" size="xs" onClick={() => roll("coin", 2)}>
              Flip a coin
            </RcButton>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={2}
              max={999}
              value={rngMax}
              onChange={(e) => setRngMax(Math.max(2, Number(e.target.value) || 2))}
              aria-label="Random number upper bound"
              className="h-7 w-16 rounded-rc-md border border-rc-line/22 bg-black/40 px-2 font-rc-mono text-xs tabular-nums text-rc-fg"
            />
            <RcButton variant="outline" size="xs" onClick={() => roll(`1–${rngMax}`, rngMax)}>
              Random
            </RcButton>
          </div>
          {rolls.length > 0 && (
            <ol className="flex flex-col gap-0.5 font-rc-mono text-xs tabular-nums text-rc-fg-muted">
              {rolls.map((r, i) => (
                <li key={`${r}-${i}`}>{r}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {cemeteryOpen && interaction.cemetery.length > 0 && (
        <div className="pointer-events-auto fixed bottom-20 left-1/2 z-[160] w-[min(92vw,640px)] -translate-x-1/2">
          <CpuCardPick
            title="Castable from your cemetery"
            items={interaction.cemetery.map((c) => ({ id: c.token, card: cardRefFor(c.name) }))}
            onPick={(token) => {
              interaction.begin(token);
              setCemeteryOpen(false);
            }}
            onClose={() => setCemeteryOpen(false)}
          />
        </div>
      )}

      {collectionOpen && pool.length > 0 && (
        <div className="pointer-events-auto fixed bottom-20 left-1/2 z-[160] w-[min(92vw,880px)] -translate-x-1/2">
          <CpuCardPick
            title={`Your collection (${pool.length}) — the pool "from your collection" effects fetch from`}
            items={pool.map((card, i) => ({ id: card.instanceId ?? String(i), card }))}
            onPick={() => undefined}
            onClose={() => setCollectionOpen(false)}
          />
        </div>
      )}

      {logOpen && (
        <div className="thin-scrollbar pointer-events-auto fixed bottom-4 left-3 z-[150] max-h-[50vh] w-[min(92vw,380px)] overflow-y-auto rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 font-rc-sans text-xs text-rc-fg shadow-rc-panel">
          <ol className="flex flex-col gap-1">
            {log.map((entry, i) => (
              <li key={`${entry.turn}-${i}`} className={entry.player === HUMAN_SEAT ? "text-rc-fg" : "text-rc-fg-muted"}>
                <span className="mr-1.5 font-rc-mono tabular-nums text-rc-fg-subtle">{entry.turn}</span>
                {localizeEngineText(entry.msg)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
