#!/usr/bin/env node
/*
  Optimized KTX2 compression for Sorcery card textures

  IMPROVEMENTS:
  - Uses calibrated UASTC presets by default for high fidelity
  - Automatic format selection based on image content
  - Adaptive RDO/Zstd targeting card-quality thresholds
  - Automatic format selection based on image content
  - Better sizing for card textures

  Usage:
    node scripts/compress-ktx2-optimized.js
    node scripts/compress-ktx2-optimized.js --input data --outDir data-ktx2-optimized
    node scripts/compress-ktx2-optimized.js --quality high  # For premium cards
*/

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

// --------- CLI args ---------
const args = process.argv.slice(2);
function getFlag(name, def) {
  const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return def;
  const a = args[i];
  const eq = a.indexOf('=');
  if (eq !== -1) return a.slice(eq + 1);
  const next = args[i + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

// Configuration - handle boolean returns from getFlag
const inputFlag = getFlag('input', 'data');
const INPUT_DIR = path.resolve((inputFlag === true) ? 'data' : String(inputFlag));

const outDirFlag = getFlag('outDir', '');
const OUT_DIR = (outDirFlag && outDirFlag !== true) ? path.resolve(String(outDirFlag)) : '';

const qualityFlag = getFlag('quality', 'balanced');
const QUALITY = String((qualityFlag === true) ? 'balanced' : qualityFlag).toLowerCase();

const FORCE = Boolean(getFlag('force', false));
const DRY = Boolean(getFlag('dryRun', false));
const MIN_KB = Number(getFlag('minKB', 10)); // Lower threshold for small icons
const CONCURRENCY = Number(getFlag('jobs', Math.max(1, Math.min(os.cpus().length - 1, 4))));

// Quality presets - prioritizing visual quality
const QUALITY_PRESETS = {
  fast: {
    format: 'uastc',
    uastc_level: 3,
    uastc_rdo: 1.25,
    zstd: 12,
    resize_factor: 1.0,
    targetKB: 450
  },
  balanced: {
    format: 'uastc',
    uastc_level: 2,
    uastc_rdo: 1.0,
    zstd: 14,
    resize_factor: 1.0,
    targetKB: 400
  },
  high: {
    format: 'uastc',
    uastc_level: 1,
    uastc_rdo: 0.75,
    zstd: 18,
    resize_factor: 1.0,
    targetKB: 9999
  }
};

const preset = QUALITY_PRESETS[QUALITY] || QUALITY_PRESETS.balanced;

// --------- Tool detection ---------
function which(cmd) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout.trim()) return cmd;
  return null;
}

function findToktx() {
  const found = which('toktx');
  if (found) return found;
  const brewPath = '/opt/homebrew/bin/toktx';
  if (fs.existsSync(brewPath)) return brewPath;
  return null;
}

const TOKTX = findToktx();

if (!TOKTX) {
  console.error('ERROR: toktx not found. Install KTX-Software\n  macOS: brew install ktx-software');
  process.exit(1);
}

// --------- Helpers ---------
async function getPngDimensions(inFile) {
  try {
    const fh = await fsp.open(inFile, 'r');
    try {
      const buf = Buffer.alloc(24 + 17);
      await fh.read(buf, 0, buf.length, 0);
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)) return null;
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      return { width: w, height: h };
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

// Determine optimal format based on image characteristics
async function determineOptimalSettings(inFile) {
  const settings = { ...preset };
  const basename = path.basename(inFile).toLowerCase();

  // Card backs, atlases and avatars need highest quality
  if (basename.includes('cardback') || basename.includes('atlas') || basename.includes('avatar')) {
    settings.format = 'uastc';
    settings.uastc_level = Math.min(settings.uastc_level, 1);
    settings.uastc_rdo = Math.min(settings.uastc_rdo, 0.75);
    settings.zstd = Math.max(settings.zstd, 18);
    settings.resize_factor = 1.0;
  }
  // Small cards (_s suffix) can tolerate higher RDO but keep UASTC for consistency
  else if (basename.includes('_s.') || basename.includes('_s_')) {
    settings.format = 'uastc';
    settings.uastc_level = Math.max(settings.uastc_level, 3);
    settings.uastc_rdo = Math.max(settings.uastc_rdo, 1.5);
    settings.resize_factor = 1.0;
  }
  // Full size cards (_f suffix) need excellent quality
  else if (basename.includes('_f.') || basename.includes('_f_')) {
    settings.resize_factor = 1.0; // Keep full size
  }

  // Get dimensions to optimize further
  const dims = await getPngDimensions(inFile);
  if (dims && (dims.width > 4096 || dims.height > 4096)) {
    // Safety cap for ultra large sources
    settings.resize_factor = Math.min(settings.resize_factor, 0.75);
  }

  return settings;
}

function calculateResize(width, height, factor) {
  // Ensure multiples of 4 for block compression, rounding up to preserve detail.
  const targetW = Math.max(1, Math.round(width * factor));
  const targetH = Math.max(1, Math.round(height * factor));
  const finalW = Math.max(4, Math.ceil(targetW / 4) * 4);
  const finalH = Math.max(4, Math.ceil(targetH / 4) * 4);
  return `${finalW}x${finalH}`;
}

async function buildToktxArgs(inFile, outFile, settings) {
  const args = [];

  // Force KTX2 container
  args.push('--t2');

  // Compression format
  if (settings.format === 'uastc') {
    args.push('--uastc', String(settings.uastc_level));
    args.push('--uastc_rdo_l', String(settings.uastc_rdo));
    args.push('--uastc_rdo_d', '1');
    args.push('--zcmp', String(settings.zstd));
  } else {
    // ETC1S/BasisLZ fallback when explicitly requested via CLI presets
    args.push('--bcmp');
    args.push('--qlevel', String(settings.qlevel ?? 64));
  }

  // Generate mipmaps for better performance at different scales
  args.push('--genmipmap');

  // Color space
  args.push('--assign_oetf', 'srgb', '--assign_primaries', 'bt709');

  // Always ensure output dimensions align to 4x4 blocks (and optional downscaling)
  const dims = await getPngDimensions(inFile);
  if (dims) {
    const resizeGeom = calculateResize(dims.width, dims.height, settings.resize_factor);
    const [targetW, targetH] = resizeGeom.split('x').map((n) => Number(n) || 0);
    const needsResize =
      targetW > 0 &&
      targetH > 0 &&
      (targetW !== dims.width || targetH !== dims.height);
    if (needsResize) {
      args.push('--resize', resizeGeom);
    }
  } else if (settings.resize_factor < 1.0) {
    console.warn(
      `⚠️  Unable to determine dimensions for ${inFile}; skipping downscale but block alignment may fail.`
    );
  }

  // Output and input files
  args.push(outFile, inFile);
  return args;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

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

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function makeOutputPath(inFile) {
  if (OUT_DIR) {
    const rel = path.relative(INPUT_DIR, inFile);
    const relDir = path.dirname(rel);
    const base = path.basename(inFile, path.extname(inFile)) + '.ktx2';
    return path.join(OUT_DIR, relDir, base);
  }
  return inFile.replace(/\.[^.]+$/, '.ktx2');
}

async function compressOne(inFile) {
  const stat = await fsp.stat(inFile);
  if (stat.size / 1024 < MIN_KB) {
    return { skipped: true, reason: `below minKB (${MIN_KB}KB)` };
  }

  const outFile = makeOutputPath(inFile);

  if (!FORCE) {
    try {
      const ostat = await fsp.stat(outFile);
      if (ostat.mtimeMs >= stat.mtimeMs && ostat.size > 0) {
        return { skipped: true, reason: 'up-to-date', outFile };
      }
    } catch {}
  }

  if (DRY) {
    return { dry: true, outFile };
  }

  await ensureDir(path.dirname(outFile));

  // Determine optimal settings for this specific image
  const settings = await determineOptimalSettings(inFile);
  const argv = await buildToktxArgs(inFile, outFile, settings);

  return new Promise((resolve) => {
    const startSize = stat.size;
    const p = spawn(TOKTX, argv, { stdio: 'pipe' });
    let stderr = '';

    p.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    p.on('close', async (code) => {
      if (code === 0) {
        try {
          const outStat = await fsp.stat(outFile);
          const outKB = outStat.size / 1024;
          const targetKB = settings.targetKB ?? preset.targetKB ?? Infinity;
          if (outKB > targetKB && targetKB < Infinity) {
            // Soft fail so caller can retry with stronger compression if desired
            resolve({
              ok: false,
              outFile,
              code: 0,
              error: `output ${outKB.toFixed(1)}KB exceeds target ${targetKB}KB`,
              settings
            });
            return;
          }
          const compression = ((1 - outStat.size / startSize) * 100).toFixed(1);
          resolve({
            ok: true,
            outFile,
            compression: `${compression}%`,
            originalSize: formatKB(startSize),
            compressedSize: formatKB(outStat.size),
            settings
          });
        } catch {
          resolve({ ok: true, outFile, settings });
        }
      } else {
        resolve({ ok: false, outFile, code, error: stderr });
      }
    });
  });
}

function formatKB(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

async function main() {
  try {
    const s = await fsp.stat(INPUT_DIR);
    if (!s.isDirectory()) throw new Error('Not a directory');
  } catch (e) {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  console.log(`Optimized KTX2 Compression`);
  console.log(`========================`);
  console.log(`Input:       ${INPUT_DIR}`);
  console.log(`Output:      ${OUT_DIR || '(side-by-side)'}`);
  console.log(`Quality:     ${QUALITY} (${preset.format})`);
  console.log(`Compression: qlevel=${preset.qlevel}, resize=${preset.resize_factor}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Force:       ${FORCE}\n`);

  const files = [];
  for await (const f of walk(INPUT_DIR)) {
    const ext = path.extname(f).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    files.push(f);
  }

  if (!files.length) {
    console.log('No image files found.');
    return;
  }

  console.log(`Found ${files.length} image(s). Processing...\n`);

  let idx = 0, active = 0, ok = 0, skipped = 0, failed = 0;
  const results = [];
  let totalOriginal = 0, totalCompressed = 0;

  await new Promise((resolve) => {
    function kick() {
      while (active < CONCURRENCY && idx < files.length) {
        const inFile = files[idx++];
        active++;
        compressOne(inFile).then((res) => {
          results.push({ inFile, ...res });
          if (res.ok) {
            ok++;
            if (res.originalSize && res.compressedSize) {
              // Parse sizes for totals
              const origKB = parseFloat(res.originalSize.replace('MB', '').replace('KB', ''));
              const compKB = parseFloat(res.compressedSize.replace('MB', '').replace('KB', ''));
              totalOriginal += res.originalSize.includes('MB') ? origKB * 1024 : origKB;
              totalCompressed += res.compressedSize.includes('MB') ? compKB * 1024 : compKB;
            }
            // Show progress for successful compressions
            const rel = path.relative(INPUT_DIR, inFile);
            console.log(`✓ ${rel} (${res.originalSize} → ${res.compressedSize}, -${res.compression})`);
          }
          else if (res.skipped || res.dry) skipped++;
          else {
            failed++;
            const rel = path.relative(INPUT_DIR, inFile);
            console.log(`✗ ${rel} (error: ${res.error?.split('\n')[0] || 'unknown'})`);
          }
          active--;
          kick();
        });
      }
      if (active === 0 && idx >= files.length) resolve();
    }
    kick();
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Processed:  ${ok} files`);
  console.log(`  Skipped:    ${skipped} files`);
  console.log(`  Failed:     ${failed} files`);
  if (totalOriginal > 0 && totalCompressed > 0) {
    const totalCompression = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);
    console.log(`  Total size: ${formatKB(totalOriginal * 1024)} → ${formatKB(totalCompressed * 1024)} (-${totalCompression}%)`);
  }
  console.log('='.repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});