import { create } from "zustand";

/** Transient UI selection only; never sent to the match or saved in snapshots.
 * Entries are pick tokens (see pickTokens.js): plain "x,y" tiles, or board cards, hand cards, directions, piles and anchored buttons;
 * each renderer shows only its own kind. `tiles` capture clicks (`selected` is the one clicked); `glow` (chosen targets) and
 * `sources` (casters, ability sources) only light up; `labels` gives the text of tokens drawn as buttons (e.g. "opt:2,1:decline" → "Decline"). */
export const useCpuBoardPicker = create<{
  request: string; tiles: string[]; selected: string | null; glow: string[]; sources: string[]; labels: Record<string, string>;
  /** The token the pointer is over, published so a caller can preview what picking it would do
   *  (the direction prompt lights the lane the projectile would travel). */
  hovered: string | null;
  /** True once a choice has been started and the board is asking for the NEXT step of it
   *  (a spell's target, the caster to cast with). Lets the board show "continue or cancel"
   *  differently from "here is what you could begin". */
  sequence: boolean;
  /** For an area prompt: tile token -> the squares that picking it would cover, so the board can
   *  show the whole footprint under the pointer without the caller rearming on every hover. */
  areas: Record<string, string[]>;
  configure: (request: string, tiles: string[]) => void;
  setGlow: (request: string, tiles: string[], sources?: string[]) => void;
  setLabels: (request: string, labels: Record<string, string>) => void;
  setHovered: (token: string | null) => void;
  setSequence: (request: string, sequence: boolean) => void;
  setAreas: (request: string, areas: Record<string, string[]>) => void;
  select: (tile: string) => void;
  /** Drop the current selection but keep the armed tokens, glow and labels, so a caller can
   *  accept a click — or refuse it — and leave exactly the same choices live. */
  deselect: (request: string) => void;
  clear: (request: string) => void;
}>((set) => ({
  request:"",tiles:[],selected:null,glow:[],sources:[],labels:{},hovered:null,sequence:false,areas:{},
  configure:(request,tiles) => set(state => state.request === request ? {tiles,selected:state.selected && tiles.includes(state.selected) ? state.selected : null} : {request,tiles,selected:null,glow:[],sources:[],labels:{},hovered:null,sequence:false,areas:{}}),
  setGlow:(request,glow,sources = []) => set(state => state.request === request ? {glow,sources} : {request,tiles:[],selected:null,glow,sources,labels:{},hovered:null,sequence:false,areas:{}}),
  setLabels:(request,labels) => set(state => state.request === request ? {labels} : {request,tiles:[],selected:null,glow:[],sources:[],labels,hovered:null,sequence:false,areas:{}}),
  setHovered:hovered => set(state => state.hovered === hovered ? state : {hovered}),
  setSequence:(request,sequence) => set(state => state.request === request && state.sequence !== sequence ? {sequence} : state),
  setAreas:(request,areas) => set(state => state.request === request ? {areas} : {request,tiles:[],selected:null,glow:[],sources:[],labels:{},hovered:null,sequence:false,areas}),
  select:tile => set(state => state.tiles.includes(tile) ? {selected:tile} : state),
  deselect:request => set(state => state.request === request ? {selected:null} : state),
  clear:request => set(state => state.request === request ? {request:"",tiles:[],selected:null,glow:[],sources:[],labels:{},hovered:null,sequence:false,areas:{}} : state),
}));

// Dev handle so headless checks can click picker tokens (the canvas can't be DOM-clicked).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__cpuBoardPicker = useCpuBoardPicker;
}
