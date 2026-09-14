import { create } from "zustand";

/** Transient UI selection only; never sent to the match or saved in snapshots.
 * `tiles` capture clicks (`selected` is the one clicked); `glow` (chosen targets) and `sources` (casters, ability sources) only light up. */
export const useCpuBoardPicker = create<{
  request: string; tiles: string[]; selected: string | null; glow: string[]; sources: string[];
  configure: (request: string, tiles: string[]) => void;
  setGlow: (request: string, tiles: string[], sources?: string[]) => void;
  select: (tile: string) => void;
  clear: (request: string) => void;
}>((set) => ({
  request:"",tiles:[],selected:null,glow:[],sources:[],
  configure:(request,tiles) => set(state => state.request === request ? {tiles,selected:state.selected && tiles.includes(state.selected) ? state.selected : null} : {request,tiles,selected:null,glow:[],sources:[]}),
  setGlow:(request,glow,sources = []) => set(state => state.request === request ? {glow,sources} : {request,tiles:[],selected:null,glow,sources}),
  select:tile => set(state => state.tiles.includes(tile) ? {selected:tile} : state),
  clear:request => set(state => state.request === request ? {request:"",tiles:[],selected:null,glow:[],sources:[]} : state),
}));
