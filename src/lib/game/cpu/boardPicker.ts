import { create } from "zustand";

/** Transient UI selection only; never sent to the match or saved in snapshots.
 * Entries are pick tokens (see pickTokens.js): plain "x,y" tiles, or board cards, hand cards, directions, piles and anchored buttons;
 * each renderer shows only its own kind. `tiles` capture clicks (`selected` is the one clicked); `glow` (chosen targets) and
 * `sources` (casters, ability sources) only light up; `labels` gives the text of tokens drawn as buttons (e.g. "opt:2,1:decline" → "Decline"). */
export const useCpuBoardPicker = create<{
  request: string; tiles: string[]; selected: string | null; glow: string[]; sources: string[]; labels: Record<string, string>;
  configure: (request: string, tiles: string[]) => void;
  setGlow: (request: string, tiles: string[], sources?: string[]) => void;
  setLabels: (request: string, labels: Record<string, string>) => void;
  select: (tile: string) => void;
  clear: (request: string) => void;
}>((set) => ({
  request:"",tiles:[],selected:null,glow:[],sources:[],labels:{},
  configure:(request,tiles) => set(state => state.request === request ? {tiles,selected:state.selected && tiles.includes(state.selected) ? state.selected : null} : {request,tiles,selected:null,glow:[],sources:[],labels:{}}),
  setGlow:(request,glow,sources = []) => set(state => state.request === request ? {glow,sources} : {request,tiles:[],selected:null,glow,sources,labels:{}}),
  setLabels:(request,labels) => set(state => state.request === request ? {labels} : {request,tiles:[],selected:null,glow:[],sources:[],labels}),
  select:tile => set(state => state.tiles.includes(tile) ? {selected:tile} : state),
  clear:request => set(state => state.request === request ? {request:"",tiles:[],selected:null,glow:[],sources:[],labels:{}} : state),
}));
