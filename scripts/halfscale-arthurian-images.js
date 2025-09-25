#!/usr/bin/env node
"use strict";

/**
 * Halve the pixel dimensions of PNG images while keeping folder structure.
 *
 * Defaults:
 *   input  = data/arthurian_legends
 *   output = data/arthurian_legends-halfsized
 *
 * Example:
 *   node scripts/halfscale-arthurian-images.js
 *   node scripts/halfscale-arthurian-images.js --input data/arthurian_legends --outDir data/arthurian_legends-halfsized --force
 */

const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");

const args = process.argv.slice(2);
function getFlag(name, def) {
  const idx = args.findIndex(
    (a) => a === `--${name}` || a.startsWith(`--${name}=`)
  );
  if (idx === -1) return def;
  const arg = args[idx];
  const eq = arg.indexOf("=");
  if (eq !== -1) return arg.slice(eq + 1);
  const next = args[idx + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

const inputFlag = getFlag("input", "data/arthurian_legends");
const INPUT_DIR = path.resolve(
  inputFlag === true ? "data/arthurian_legends" : String(inputFlag)
);
const outFlag = getFlag("outDir", "data/arthurian_legends-halfsized");
const OUTPUT_DIR = path.resolve(
  outFlag === true ? "data/arthurian_legends-halfsized" : String(outFlag)
);
const FORCE = Boolean(getFlag("force", false));
const DRY = Boolean(getFlag("dryRun", false));
const CONCURRENCY = Math.max(
  1,
  Number(getFlag("jobs", Math.min(os.cpus().length, 4)))
);

const IMAGE_EXTS = new Set([".png"]);

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function halfAndAlign(value) {
  let target = Math.floor(value / 2);
  if (target < 4) target = 4;
  target -= target % 4;
  if (target < 4) target = 4;
  return target;
}

async function processFile(file) {
  const rel = path.relative(INPUT_DIR, file);
  const ext = path.extname(file).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    return { skipped: true, reason: "unsupported", rel };
  }

  const outPath = path.join(OUTPUT_DIR, rel);

  if (!FORCE) {
    try {
      const srcStat = await fsp.stat(file);
      const dstStat = await fsp.stat(outPath);
      if (dstStat.mtimeMs >= srcStat.mtimeMs && dstStat.size > 0) {
        return { skipped: true, reason: "up-to-date", rel };
      }
    } catch {
      // ignore missing output
    }
  }

  if (DRY) {
    return { dry: true, rel };
  }

  await ensureDir(path.dirname(outPath));

  const image = sharp(file);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    return { skipped: true, reason: "missing-dimensions", rel };
  }

  const width = meta.width;
  const height = meta.height;
  const targetW = halfAndAlign(width);
  const targetH = halfAndAlign(height);

  await image
    .resize(targetW, targetH, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  return { ok: true, rel, width, height, targetW, targetH };
}

async function main() {
  try {
    const stats = await fsp.stat(INPUT_DIR);
    if (!stats.isDirectory()) throw new Error("Input is not a directory");
  } catch (err) {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  console.log("Half-scaling PNG assets");
  console.log("=======================");
  console.log(`Input:  ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Force:  ${FORCE}`);
  console.log(`Dry:    ${DRY}`);
  console.log(`Jobs:   ${CONCURRENCY}`);

  const files = [];
  for await (const file of walk(INPUT_DIR)) {
    if (IMAGE_EXTS.has(path.extname(file).toLowerCase())) {
      files.push(file);
    }
  }

  if (files.length === 0) {
    console.log("No PNG files found.");
    return;
  }

  console.log(`Found ${files.length} PNG(s). Processing...\n`);

  let idx = 0;
  let active = 0;
  let ok = 0;
  let skipped = 0;
  const failures = [];

  await new Promise((resolve) => {
    function kick() {
      while (active < CONCURRENCY && idx < files.length) {
        const file = files[idx++];
        active++;
        processFile(file)
          .then((res) => {
            if (res.ok) {
              ok++;
              console.log(
                `✓ ${res.rel} (${res.width}x${res.height} → ${res.targetW}x${res.targetH})`
              );
            } else if (res.dry) {
              skipped++;
              console.log(`◦ ${res.rel} (dry run)`);
            } else {
              skipped++;
              console.log(`• ${res.rel} (skipped: ${res.reason})`);
            }
          })
          .catch((err) => {
            failures.push({ file, error: err });
            console.log(
              `✗ ${path.relative(INPUT_DIR, file)} (${err.message || err})`
            );
          })
          .finally(() => {
            active--;
            kick();
          });
      }
      if (active === 0 && idx >= files.length) {
        resolve();
      }
    }
    kick();
  });

  console.log("\nSummary");
  console.log("-------");
  console.log(`Processed: ${ok}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failures.length}`);
  if (failures.length) {
    for (const { file, error } of failures) {
      console.log(
        `  - ${path.relative(INPUT_DIR, file)} :: ${error.message || error}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
