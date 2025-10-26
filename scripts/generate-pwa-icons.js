#!/usr/bin/env node
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const sharp = require("sharp");

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function generateIcon({ src, size, out, background }) {
  const pipeline = sharp(src).resize(size, size, {
    fit: "contain",
    background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  await pipeline.png().toFile(out);
  console.log("Generated", path.relative(process.cwd(), out));
}

async function main() {
  const projectRoot = process.cwd();
  const inputArg = process.argv.find((v) => v.startsWith("--input="));
  const src = inputArg ? inputArg.split("=")[1] : path.join(projectRoot, "src", "app", "logo.png");

  try {
    await fsp.access(src, fs.constants.R_OK);
  } catch {
    console.error("Input logo not found:", src);
    process.exit(1);
  }

  const publicDir = path.join(projectRoot, "public");
  const iconsDir = path.join(publicDir, "icons");
  await ensureDir(iconsDir);

  await generateIcon({ src, size: 192, out: path.join(iconsDir, "icon-192.png") });
  await generateIcon({ src, size: 512, out: path.join(iconsDir, "icon-512.png") });

  const bg = { r: 17, g: 17, b: 17, alpha: 1 };
  await generateIcon({ src, size: 192, out: path.join(iconsDir, "icon-192-maskable.png"), background: bg });
  await generateIcon({ src, size: 512, out: path.join(iconsDir, "icon-512-maskable.png"), background: bg });

  await generateIcon({ src, size: 180, out: path.join(publicDir, "apple-touch-icon.png"), background: bg });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
