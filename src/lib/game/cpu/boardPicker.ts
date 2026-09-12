import { create } from "zustand";

/** Transient UI selection only; never sent to the match or saved in snapshots. */
export const useCpuBoardPicker = create<{
  request: string; tiles: string[]; selected: string | null;
  configure: (request: string, tiles: string[]) => void;
  select: (tile: string) => void;
  clear: (request: string) => void;
}>((set) => ({
  request:"",tiles:[],selected:null,
  configure:(request,tiles) => set(state => ({request,tiles,selected:state.request === request && state.selected && tiles.includes(state.selected) ? state.selected : null})),
  select:tile => set(state => state.tiles.includes(tile) ? {selected:tile} : state),
  clear:request => set(state => state.request === request ? {request:"",tiles:[],selected:null} : state),
}));
