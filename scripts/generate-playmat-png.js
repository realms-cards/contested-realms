const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

// Register the font
const fontPath = path.join(__dirname, "../public/fantaisie_artistiqu.ttf");
registerFont(fontPath, { family: "Fantaisie Artistique" });

// Canvas dimensions matching playmat
const WIDTH = 2556;
const HEIGHT = 1663;

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

// Transparent background
ctx.clearRect(0, 0, WIDTH, HEIGHT);

// Grid line style - 30% opacity white
ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
ctx.lineWidth = 2;

// Grid bounds
const gridLeft = 306.2;
const gridRight = 2249.8;
const gridTop = 54;
const gridBottom = 1609;
const tilePx = 388.73;

// Vertical lines (6 lines for 5 columns)
const verticalLines = [306.2, 694.9, 1083.6, 1472.4, 1861.1, 2249.8];
verticalLines.forEach((x) => {
  ctx.beginPath();
  ctx.moveTo(x, gridTop);
  ctx.lineTo(x, gridBottom);
  ctx.stroke();
});

// Horizontal lines (5 lines for 4 rows)
const horizontalLines = [54, 442.8, 831.5, 1220.2, 1609];
horizontalLines.forEach((y) => {
  ctx.beginPath();
  ctx.moveTo(gridLeft, y);
  ctx.lineTo(gridRight, y);
  ctx.stroke();
});

// Tile numbers - 30% opacity white, Fantaisie Artistique font
ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
ctx.font = '32px "Fantaisie Artistique"';

// Tile positions (upper-left of each tile)
const tiles = [
  // Row 1
  { num: 1, x: 318, y: 90 },
  { num: 2, x: 707, y: 90 },
  { num: 3, x: 1096, y: 90 },
  { num: 4, x: 1484, y: 90 },
  { num: 5, x: 1873, y: 90 },
  // Row 2
  { num: 6, x: 318, y: 479 },
  { num: 7, x: 707, y: 479 },
  { num: 8, x: 1096, y: 479 },
  { num: 9, x: 1484, y: 479 },
  { num: 10, x: 1873, y: 479 },
  // Row 3
  { num: 11, x: 318, y: 867 },
  { num: 12, x: 707, y: 867 },
  { num: 13, x: 1096, y: 867 },
  { num: 14, x: 1484, y: 867 },
  { num: 15, x: 1873, y: 867 },
  // Row 4
  { num: 16, x: 318, y: 1256 },
  { num: 17, x: 707, y: 1256 },
  { num: 18, x: 1096, y: 1256 },
  { num: 19, x: 1484, y: 1256 },
  { num: 20, x: 1873, y: 1256 },
];

tiles.forEach((tile) => {
  ctx.fillText(String(tile.num), tile.x, tile.y);
});

// Save as PNG
const outputPath = path.join(__dirname, "../public/playmat-overlay.png");
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync(outputPath, buffer);

console.log("PNG created:", outputPath);
