"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RcButton } from "@/components/ui/rc-button";

export default function GoldfishTestControls({paused,onPauseChange,onRestart}: {
  paused: boolean; onPauseChange: (paused: boolean) => void; onRestart: () => void;
}) {
  const [open,setOpen] = useState(false);
  const [confirm,setConfirm] = useState(false);
  const restarting = useRef(false);
  const close = () => {setOpen(false);setConfirm(false);};
  return <>
    <button onClick={() => setOpen(true)} className="cursor-pointer rounded-rc-md border border-rc-accent/35 bg-[rgba(7,10,20,0.95)] px-3 py-2 font-rc-sans text-sm text-rc-spark shadow-rc-panel transition-colors hover:border-rc-accent hover:text-rc-accent-ring">{paused ? "CPU paused — Test controls" : "Test controls"}</button>
    {open && <Modal onClose={close} closeOnBackdrop={false} backdropClassName="bg-[rgba(6,10,20,0.8)]">
      <section className="max-w-md rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 font-rc-sans text-rc-fg shadow-rc-panel space-y-4">
        <h2 className="font-rc-display text-[26px] leading-none text-rc-fg-strong">Goldfish test controls</h2>
        {confirm ? <>
          <p>Leave this game and start a fresh test? Leaving concedes the current game; it cannot be undone. Your previous deck list and opponent selection remain available in Goldfish setup in this tab.</p>
          <div className="flex gap-3">
            <RcButton variant="outline" onClick={() => setConfirm(false)}>Keep this game</RcButton>
            <RcButton variant="destructive" onClick={() => {if (restarting.current) return;restarting.current = true;onRestart();}}>Leave and test again</RcButton>
          </div>
        </> : <>
          <p className="text-sm text-rc-fg-muted">Pause the CPU between actions to inspect the board. An action or effect already in progress may finish; this does not undo it.</p>
          <RcButton onClick={() => onPauseChange(!paused)} className="flex">{paused ? "Resume CPU actions" : "Pause CPU actions"}</RcButton>
          <RcButton variant="outline" onClick={() => setConfirm(true)} className="flex">Start a fresh test…</RcButton>
          <RcButton variant="ghost" onClick={close}>Back to board</RcButton>
        </>}
      </section>
    </Modal>}
  </>;
}
