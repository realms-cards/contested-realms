"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

export default function GoldfishTestControls({paused,onPauseChange,onRestart}: {
  paused: boolean; onPauseChange: (paused: boolean) => void; onRestart: () => void;
}) {
  const [open,setOpen] = useState(false);
  const [confirm,setConfirm] = useState(false);
  const restarting = useRef(false);
  const close = () => {setOpen(false);setConfirm(false);};
  return <>
    <button onClick={() => setOpen(true)} className="rounded-lg border border-amber-400/30 bg-slate-900/95 px-3 py-2 text-sm text-amber-100">{paused ? "CPU paused — Test controls" : "Test controls"}</button>
    {open && <Modal onClose={close} closeOnBackdrop={false}>
      <section className="max-w-md rounded-xl border border-amber-400/30 bg-slate-900 p-6 text-white space-y-4">
        <h2 className="font-fantaisie text-2xl">Goldfish test controls</h2>
        {confirm ? <>
          <p>Leave this game and start a fresh test? Leaving concedes the current game; it cannot be undone. Your previous deck list and opponent selection remain available in Goldfish setup in this tab.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirm(false)} className="rounded bg-slate-700 px-4 py-2">Keep this game</button>
            <button onClick={() => {if (restarting.current) return;restarting.current = true;onRestart();}} className="rounded bg-red-700 px-4 py-2">Leave and test again</button>
          </div>
        </> : <>
          <p className="text-sm text-slate-300">Pause the CPU between actions to inspect the board. An action or effect already in progress may finish; this does not undo it.</p>
          <button onClick={() => onPauseChange(!paused)} className="block rounded bg-indigo-600 px-4 py-2">{paused ? "Resume CPU actions" : "Pause CPU actions"}</button>
          <button onClick={() => setConfirm(true)} className="block rounded bg-slate-700 px-4 py-2">Start a fresh test…</button>
          <button onClick={close} className="rounded border border-slate-600 px-4 py-2">Back to board</button>
        </>}
      </section>
    </Modal>}
  </>;
}
