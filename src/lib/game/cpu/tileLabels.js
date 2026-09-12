/** Convert internal cell keys in generated choice labels to playmat tile numbers.
 * @param {string} label @param {{w:number,h:number}} size */
function tileLabel(label,size) {
  return label.replace(/\b(\d+),(\d+)\b/g,(cell,x,y) => Number(x)<size.w && Number(y)<size.h ? `Tile #${Number(y)*size.w+Number(x)+1}` : cell);
}
/** Extract the destination field before formatting a generated resolver label.
 * Direction choices keep their direction selector; their origin is not a target.
 * @param {string} label @param {{w:number,h:number}} size */
function choiceTiles(label,size) {
  if (/\bshoot\b/i.test(label)) return [];
  const cells = [...label.matchAll(/\b(\d+),(\d+)\b/g)]
    .filter(match => Number(match[1]) < size.w && Number(match[2]) < size.h);
  return cells.length ? [cells[cells.length-1][0]] : [];
}
module.exports = {tileLabel,choiceTiles};
