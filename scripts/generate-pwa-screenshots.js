#!/usr/bin/env node
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const sharp = require("sharp");

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function renderScreenshot({ src, out, width, height, background }) {
  const img = sharp(src).resize(width, height, {
    fit: "contain",
    background: background ?? { r: 17, g: 17, b: 17, alpha: 1 },
  });
  await img.png().toFile(out);
  console.log("Generated", path.relative(process.cwd(), out));
}

async function main() {
  const projectRoot = process.cwd();
  const inputArg = process.argv.find((v) => v.startsWith("--input="));
  const src = inputArg ? inputArg.split("=")[1] : path.join(projectRoot, "src", "app", "screenshot.png");

  try {
    await fsp.access(src, fs.constants.R_OK);
  } catch {
    console.error("Input screenshot not found:", src);
    process.exit(1);
  }

  const outDir = path.join(projectRoot, "public", "screenshots");
  await ensureDir(outDir);

  await renderScreenshot({ src, out: path.join(outDir, "wide-1280x720.png"), width: 1280, height: 720 });
  await renderScreenshot({ src, out: path.join(outDir, "mobile-720x1280.png"), width: 720, height: 1280 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
