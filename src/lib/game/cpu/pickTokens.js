// Pick tokens: the precise things a CPU-match choice asks the player to click.
// They appear in SpellChoice.picks steps and projectile decision options (`at`), flow through
// useCpuBoardPicker (tiles / glow / sources / selected), and each renderer handles its own kind:
//   "x,y"                             a tile (CpuFieldTargets)
//   "unit:avatar:<seat>"              an avatar card on the board (AvatarCard)
//   "unit:perm:<instanceId>"          a permanent's card on the board (PermanentStack)
//   "unit:slot:<x,y>:<index>"         a permanent without an instance id (PermanentStack)
//   "hand:<seat>:<instanceId>"        a card in that seat's hand (Hand3D)
//   "dir:<x,y>:<N|E|S|W>"             a direction arrow drawn at a tile (CpuFieldTargets)
//   "pile:<seat>:<spellbook|atlas>"   a deck pile (Piles3D)
//   "draw:<seat>:<spells>-<sites>"    a finished draw split, built by clicking the piles (Piles3D)
//   "opt:<x,y>:<id>"                  a labelled button anchored to a tile; its text comes from useCpuBoardPicker labels (CpuFieldTargets)
const TILE = /^\d+,\d+$/;

/** @typedef {{kind:'tile',at:string}|{kind:'unit',seat:string}|{kind:'unit',instanceId:string}|{kind:'unit',at:string,index:number}|{kind:'hand',seat:string,instanceId:string}|{kind:'dir',at:string,dir:string}|{kind:'pile',seat:string,pile:string}|{kind:'draw',seat:string,spells:number,sites:number}|{kind:'opt',at:string,id:string}} PickToken */

/** @param {{kind:'avatar',seat:string}|{kind:'permanent',at:string,index:number,instanceId?:string|null}|{kind:string,seat?:string,at?:string,index?:number|null,instanceId?:string|null}} target @returns {string} */
function unitToken(target) {
  if (target.kind === 'avatar') return `unit:avatar:${target.seat}`;
  return target.instanceId ? `unit:perm:${target.instanceId}` : `unit:slot:${target.at}:${target.index}`;
}
/** @param {string} seat @param {string} instanceId */
const handToken = (seat, instanceId) => `hand:${seat}:${instanceId}`;
/** @param {string} at @param {string} dir */
const dirToken = (at, dir) => `dir:${at}:${dir}`;
/** @param {string} seat @param {'spellbook'|'atlas'} pile */
const pileToken = (seat, pile) => `pile:${seat}:${pile}`;
/** @param {string} seat @param {number} spells @param {number} sites */
const drawToken = (seat, spells, sites) => `draw:${seat}:${spells}-${sites}`;
/** @param {string} at @param {string} id */
const optToken = (at, id) => `opt:${at}:${id}`;
/** @param {string} token */
const isTileToken = token => TILE.test(token);

/** @param {string} token @returns {PickToken | null} */
function parsePickToken(token) {
  if (TILE.test(token)) return { kind: 'tile', at: token };
  if (token.startsWith('unit:avatar:')) return { kind: 'unit', seat: token.slice(12) };
  if (token.startsWith('unit:perm:')) return { kind: 'unit', instanceId: token.slice(10) };
  if (token.startsWith('unit:slot:')) { const [at, index] = token.slice(10).split(':'); return { kind: 'unit', at, index: Number(index) }; }
  if (token.startsWith('hand:')) { const rest = token.slice(5), i = rest.indexOf(':'); return { kind: 'hand', seat: rest.slice(0, i), instanceId: rest.slice(i + 1) }; }
  if (token.startsWith('dir:')) { const [at, dir] = token.slice(4).split(':'); return { kind: 'dir', at, dir }; }
  if (token.startsWith('pile:')) { const [seat, pile] = token.slice(5).split(':'); return { kind: 'pile', seat, pile }; }
  if (token.startsWith('draw:')) { const [seat, split] = token.slice(5).split(':'); const [spells, sites] = (split || '').split('-').map(Number); return { kind: 'draw', seat, spells, sites }; }
  if (token.startsWith('opt:')) { const rest = token.slice(4), i = rest.indexOf(':'); return { kind: 'opt', at: rest.slice(0, i), id: rest.slice(i + 1) }; }
  return null;
}

module.exports = { unitToken, handToken, dirToken, pileToken, drawToken, optToken, isTileToken, parsePickToken };
