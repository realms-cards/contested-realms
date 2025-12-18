const sharp = require("sharp");
const path = require("path");

const WIDTH = 2556;
const HEIGHT = 1663;

async function generateBlackOverlay() {
  const inputPath = path.join(__dirname, "../public/playmat-overlay.png");
  const outputPath = path.join(
    __dirname,
    "../public/playmat-overlay-black.png"
  );

  // Take the existing white overlay and:
  // 1. Negate (invert) the colors to turn white to black
  // 2. Increase opacity by adjusting the alpha channel
  await sharp(inputPath)
    .negate({ alpha: false }) // Invert RGB but keep alpha
    .modulate({ brightness: 1.5 }) // Make it more visible
    .png()
    .toFile(outputPath);

  console.log("Black overlay PNG created:", outputPath);
}

generateBlackOverlay().catch(console.error);
