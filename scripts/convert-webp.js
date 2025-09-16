#!/usr/bin/env node
/*
  Convert PNG images to WebP into a parallel output directory (default: data-webp)

  Requirements:
    - Node.js 18+
    - npm i -D sharp

  Usage examples:
    node scripts/convert-webp.js                 # input=data, outDir=data-webp
    node scripts/convert-webp.js --input data --outDir data-webp --quality 82
    node scripts/convert-webp.js --force --jobs 4
    node scripts/convert-webp.js --lossless true # use lossless webp (bigger files)

  Notes:
    - Only .png files are processed (originals are preserved).
    - Directory structure is mirrored under outDir.
    - Skips files that are up-to-date unless --force is provided.
    - Sets default WebP quality to 82 with effort 4 (good balance).
*/

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');

// --------- CLI args ---------
const args = process.argv.slice(2);
function getFlag(name, def) {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return def;
  const a = args[i];
  const eq = a.indexOf('=');
  if (eq !== -1) return a.slice(eq + 1);
  const next = args[i + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

const INPUT_DIR = path.resolve(String(getFlag('input', 'data')));
const OUT_DIR = path.resolve(String(getFlag('outDir', 'data-webp')));
const QUALITY = Math.max(1, Math.min(100, Number(getFlag('quality', 82)) || 82));
const EFFORT = Math.max(0, Math.min(6, Number(getFlag('effort', 4)) || 4));
const FORCE = Boolean(getFlag('force', false));
const DRY = Boolean(getFlag('dryRun', false));
const LOSSLESS = String(getFlag('lossless', 'false')).toLowerCase() === 'true';
const CONCURRENCY = Number(getFlag('jobs', Math.max(1, Math.min(os.cpus().length - 1, 4))));

async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function makeOutputPath(inFile) {
  const rel = path.relative(INPUT_DIR, inFile);
  const relDir = path.dirname(rel);
  const base = path.basename(inFile, path.extname(inFile)) + '.webp';
  return path.join(OUT_DIR, relDir, base);
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function convertOne(inFile) {
  const stat = await fsp.stat(inFile);
  const outFile = makeOutputPath(inFile);

  if (!FORCE) {
    try {
      const ostat = await fsp.stat(outFile);
      if (ostat.mtimeMs >= stat.mtimeMs && ostat.size > 0) {
        return { skipped: true, reason: 'up-to-date', outFile };
      }
    } catch {}
  }

  if (DRY) return { dry: true, outFile };

  await ensureDir(path.dirname(outFile));

  try {
    const pipeline = sharp(inFile, { failOn: 'none' });
    const webpOptions = LOSSLESS
      ? { lossless: true, effort: EFFORT }
      : { quality: QUALITY, alphaQuality: Math.max(QUALITY, 82), effort: EFFORT };

    await pipeline.webp(webpOptions).toFile(outFile);
    return { ok: true, outFile };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function main() {
  // Validate input dir
  try {
    const s = await fsp.stat(INPUT_DIR);
    if (!s.isDirectory()) throw new Error('Not a directory');
  } catch (e) {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  console.log(`Converting PNG -> WebP\n- input: ${INPUT_DIR}\n- outDir: ${OUT_DIR}\n- quality: ${QUALITY}${LOSSLESS ? ' (lossless)' : ''}\n- effort: ${EFFORT}\n- force: ${!!FORCE}\n- concurrency: ${CONCURRENCY}`);

  const pngs = [];
  for await (const f of walk(INPUT_DIR)) {
    if (path.extname(f).toLowerCase() === '.png') pngs.push(f);
  }
  if (!pngs.length) {
    console.log('No PNG files found.');
    return;
  }
  console.log(`Found ${pngs.length} PNG(s).`);

  let idx = 0, active = 0, ok = 0, skipped = 0, failed = 0;
  const results = [];

  await new Promise((resolve) => {
    function kick() {
      while (active < CONCURRENCY && idx < pngs.length) {
        const inFile = pngs[idx++];
        active++;
        convertOne(inFile).then((res) => {
          results.push({ inFile, ...res });
          if (res.ok) ok++;
          else if (res.skipped || res.dry) skipped++;
          else failed++;
          active--;
          kick();
        });
      }
      if (active === 0 && idx >= pngs.length) resolve();
    }
    kick();
  });

  console.log('\nSummary:');
  for (const r of results) {
    const rel = path.relative(INPUT_DIR, r.inFile);
    if (r.ok) console.log(`✔ ${rel} -> ${path.relative(OUT_DIR, makeOutputPath(r.inFile))}`);
    else if (r.skipped) console.log(`• ${rel} (skipped: ${r.reason})`);
    else if (r.dry) console.log(`◦ ${rel} (dry-run)`);
    else console.log(`✖ ${rel} (${r.error || 'unknown error'})`);
  }
  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
