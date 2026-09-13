"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";

type Choice = {key:string;label:string;boardTiles?:string[]};
export default function CpuFieldChoices({request,choices,value,onChange,id,manual = false}: {
  request:string;choices:Choice[];value:string;onChange:(key:string)=>void;id:string;manual?:boolean;
}) {
  const [armed,setArmed] = useState(!manual);
  // Only this request's selected field affects rendering, not other highlight updates.
  const tile = useCpuBoardPicker(picker => picker.request === request ? picker.selected : null);
  const lastSelection = useRef("");
  const tilesJson = useMemo(() => JSON.stringify([...new Set(choices.flatMap(choice => choice.boardTiles || []))]),[choices]);
  useEffect(() => {
    if (armed) useCpuBoardPicker.getState().configure(request,JSON.parse(tilesJson) as string[]);
    return () => useCpuBoardPicker.getState().clear(request);
  },[request,tilesJson,armed]);
  const visible = useMemo(() => choices.filter(choice => !choice.boardTiles?.length || (tile && choice.boardTiles.includes(tile))),[choices,tile]);
  const selected = visible.find(choice => choice.key === value);
  const single = useMemo(() => {
    const atTile = tile ? visible.filter(choice => choice.boardTiles?.includes(tile)) : [];
    return atTile.length === 1 ? atTile[0].key : null;
  },[visible,tile]);
  useEffect(() => {
    const selection = `${request}:${tile}:${single}`;
    if (single && lastSelection.current !== selection) onChange(single);
    else if (value && !selected) onChange("");
    lastSelection.current = selection;
  },[request,tile,single,value,selected,onChange]);
  return <>
    {manual && tilesJson !== "[]" && <button className="my-2 rounded bg-amber-800 px-3 py-2 text-sm" onClick={() => setArmed(!armed)}>{armed ? "Cancel board targeting" : "Choose an ability target on the board"}</button>}
    {armed && tilesJson !== "[]" && <p className="my-2 text-sm text-amber-200">Click a highlighted field on the board{tile ? "; then confirm the effect below." : " to choose its target."}</p>}
    <select id={id} value={selected?.key || ""} onChange={event => onChange(event.target.value)} className="my-2 w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm">
      <option value="">{tile ? "Choose the effect at this field…" : "Choose an effect or click a highlighted field…"}</option>
      {visible.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
    </select>
  </>;
}
