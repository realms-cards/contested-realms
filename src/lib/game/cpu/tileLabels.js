/** Convert internal cell keys in generated choice labels to playmat tile numbers.
 * @param {string} label @param {{w:number,h:number}} size */
function tileLabel(label,size) {
  return label.replace(/\b(\d+),(\d+)\b/g,(cell,x,y) => Number(x)<size.w && Number(y)<size.h ? `Tile #${Number(y)*size.w+Number(x)+1}` : cell);
}
module.exports = {tileLabel};
