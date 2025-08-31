#!/usr/bin/env node
/*
  Compress textures to KTX2 using KTX-Software tools.

  Supports both legacy `toktx` and the v4.4+ unified `ktx create` CLI.
  Automatically prefers `toktx` when available (broader input support), and
  falls back to `ktx create` when needed (PNG/EXR/RAW inputs only).

  Requirements:
    - macOS: brew install ktx-software
      (or download binaries: https://github.com/KhronosGroup/KTX-Software/releases)

  Usage examples:
    node scripts/compress-ktx2.js
    node scripts/compress-ktx2.js --input data --outDir data-ktx2
    node scripts/compress-ktx2.js --format etc1s --mips false --minKB 0 --force
    node scripts/compress-ktx2.js --tool ktx   # force using the new ktx CLI
    node scripts/compress-ktx2.js --tool toktx # force using legacy toktx
    node scripts/compress-ktx2.js --enforceM4=false  # disable multiple-of-4 resize

  Notes:
    - Default format is UASTC (+Zstd) for high-quality card art and text.
    - ETC1S makes much smaller files at lower quality; use for large backgrounds if desired.
    - By default, files < 50KB are skipped (icons). Adjust with --minKB.
    - Preserves directory structure relative to --input when using --outDir.
    - When no --outDir is given, outputs next to the source as <name>.ktx2.
    - `ktx create` accepts PNG/EXR/RAW inputs. For JPG/WEBP, the script will
      transparently prefer `toktx` if available, otherwise those files are
      skipped with a warning.
    - Orientation metadata: `toktx` invocations include `--lower_left_maps_to_s0t0`.
      The `ktx create` path does not currently inject explicit orientation flags.
    - Multiples-of-4: when `--enforceM4` (default true), PNGs are resized down to the
      nearest multiple-of-4 dimensions to satisfy block compression/transcoding requirements.
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
  // value is next arg unless it's another flag
  const next = args[i + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

// Read PNG dimensions from IHDR (no external deps)
async function getPngDimensions(inFile) {
  try {
    const fh = await fsp.open(inFile, 'r');
    try {
      const buf = Buffer.alloc(24 + 17); // sig(8) + len(4) + 'IHDR'(4) + data(13) + CRC(4)
      await fh.read(buf, 0, buf.length, 0);
      // Validate PNG signature
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)) return null;
      // IHDR chunk data starts at offset 16
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

async function getImageDimensions(inFile) {
  const ext = path.extname(inFile).toLowerCase();
  if (ext === '.png') return getPngDimensions(inFile);
  // For other formats we currently skip probing to avoid extra deps.
  return null;
}

function toMultipleOf4(v) {
  if (v % 4 === 0) return v;
  return v - (v % 4);
}

async function computeResizeGeometry(inFile) {
  if (!ENFORCE_M4) return null;
  const dim = await getImageDimensions(inFile);
  if (!dim) return null;
  const w = toMultipleOf4(dim.width);
  const h = toMultipleOf4(dim.height);
  if (w === dim.width && h === dim.height) return null;
  // Downscale to nearest multiple of 4 to satisfy ETC1S/UASTC block requirements
  return `${w}x${h}`;
}

const INPUT_DIR = path.resolve(getFlag('input', 'data'));
const OUT_DIR = getFlag('outDir', '') ? path.resolve(String(getFlag('outDir'))) : '';
const FORMAT = String(getFlag('format', 'uastc')).toLowerCase(); // 'uastc' | 'etc1s'
const GEN_MIPS = String(getFlag('mips', 'true')).toLowerCase() !== 'false';
const FORCE = Boolean(getFlag('force', false));
const DRY = Boolean(getFlag('dryRun', false));
const MIN_KB = Number(getFlag('minKB', 50));
const CONCURRENCY = Number(getFlag('jobs', Math.max(1, Math.min(os.cpus().length - 1, 4))));
const TOOL_PREF = String(getFlag('tool', 'auto')).toLowerCase(); // 'auto' | 'ktx' | 'toktx'
const ENFORCE_M4 = String(getFlag('enforceM4', 'true')).toLowerCase() !== 'false';

if (!['uastc', 'etc1s'].includes(FORMAT)) {
  console.error(`--format must be 'uastc' or 'etc1s'`);
  process.exit(1);
}

// --------- tool detection ---------
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

function findKtx() {
  const found = which('ktx');
  if (found) return found;
  const brewPath = '/opt/homebrew/bin/ktx';
  if (fs.existsSync(brewPath)) return brewPath;
  return null;
}

const TOKTX = findToktx();
const KTX = findKtx();

let PRIMARY_TOOL = null; // 'ktx' | 'toktx'
if (TOOL_PREF === 'ktx') PRIMARY_TOOL = KTX ? 'ktx' : null;
else if (TOOL_PREF === 'toktx') PRIMARY_TOOL = TOKTX ? 'toktx' : null;
else PRIMARY_TOOL = TOKTX ? 'toktx' : (KTX ? 'ktx' : null);

if (!PRIMARY_TOOL) {
  console.error('ERROR: No KTX tools found. Install KTX-Software\n  macOS: brew install ktx-software\n  Releases: https://github.com/KhronosGroup/KTX-Software/releases');
  process.exit(1);
}

// --------- helpers ---------
// Accept common raster inputs. Some are only supported by toktx.
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.exr', '.raw', '.pam', '.pgm', '.ppm']);
const KTX_ACCEPTED = new Set(['.png', '.exr', '.raw']);
const TOKTX_ACCEPTED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pam', '.pgm', '.ppm']);

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
  // side-by-side
  return inFile.replace(/\.[^.]+$/, '.ktx2');
}

function buildToktxArgs(inFile, outFile, resizeGeom) {
  // toktx expects: options ... outfile infile
  const args = [];

  // Enforce KTX2 container regardless of filename
  args.push('--t2');

  // Compression settings
  if (FORMAT === 'uastc') {
    args.push('--uastc', '2'); // good balance for text
    args.push('--uastc_rdo_l', '0.75');
    args.push('--zcmp', '18');
  } else {
    args.push('--bcmp');
    args.push('--qlevel', '128');
    // NOTE: Do not apply Zstd to ETC1S/BasisLZ. It is not supported and unnecessary.
  }

  if (GEN_MIPS) args.push('--genmipmap');

  // Color space
  args.push('--assign_oetf', 'srgb', '--assign_primaries', 'bt709');

  // Orientation: map lower-left to s0t0 to match GL convention (avoids vertical mirroring)
  args.push('--lower_left_maps_to_s0t0');

  // Ensure multiple-of-four dimensions for block-compressed formats if requested
  if (resizeGeom) {
    args.push('--resize', resizeGeom);
  }

  // Now positional: outfile then infile
  args.push(outFile, inFile);
  return args;
}

function buildKtxArgs(inFile, outFile, vkFormat) {
  const args = [];
  // Subcommand first
  args.push('create');
  // Explicit Vulkan format is required by `ktx create`
  if (vkFormat) args.push('--format', vkFormat);

  // Compression settings
  if (FORMAT === 'uastc') {
    args.push('--encode', 'uastc');
    // Enable UASTC RDO post-processing and set lambda, then Zstd
    args.push('--uastc-rdo');
    args.push('--uastc-rdo-l', '0.75');
    args.push('--zstd', '18');
  } else {
    args.push('--encode', 'basis-lz');
    args.push('--qlevel', '128');
    // NOTE: Do not apply Zstd to ETC1S/BasisLZ. It is not supported and unnecessary.
  }

  if (GEN_MIPS) args.push('--generate-mipmap');

  // Color space handling
  args.push('--assign-tf', 'srgb', '--assign-primaries', 'bt709');

  // Positional: input(s) then output (ktx syntax)
  args.push(inFile, outFile);
  return args;
}

function formatKB(bytes) {
  return `${Math.round(bytes / 1024)}KB`;
}

// Determine appropriate Vulkan format for ktx create based on input.
// - PNG: inspect IHDR color type to choose RGB vs RGBA sRGB
// - EXR/RAW: default to RGBA sRGB (input has >= precision/channels)
async function determineKtxFormat(inFile) {
  const ext = path.extname(inFile).toLowerCase();
  if (ext === '.png') {
    const ct = await detectPngColorType(inFile);
    // PNG color types: 0=G,2=RGB,3=Indexed,4=GA,6=RGBA
    if (ct === 6 || ct === 4) return 'R8G8B8A8_SRGB';
    // For grayscale or indexed, ktx create converts to RGB; keep RGB
    return 'R8G8B8_SRGB';
  }
  // Safe default; EXR/RAW will downcast/convert as needed.
  return 'R8G8B8A8_SRGB';
}

async function detectPngColorType(inFile) {
  // Read first 26 bytes: 8(sig)+4(len)+4('IHDR')+4(width)+4(height)+1(bit depth)+1(color type)
  try {
    const fh = await fsp.open(inFile, 'r');
    try {
      const buf = Buffer.alloc(26);
      await fh.read(buf, 0, 26, 0);
      // Verify PNG signature 0..7
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)) return 6; // assume RGBA if unsure
      // Color type byte at offset 25
      return buf[25];
    } finally {
      await fh.close();
    }
  } catch {
    return 6; // default to RGBA on error to preserve alpha
  }
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
  // Choose tool based on availability and input extension support
  const ext = path.extname(inFile).toLowerCase();
  let toolUsed = null;
  let cmd = null;
  let argv = null;

  function canUseKtx() { return !!KTX && KTX_ACCEPTED.has(ext); }
  function canUseToktx() { return !!TOKTX && TOKTX_ACCEPTED.has(ext); }

  if (PRIMARY_TOOL === 'ktx') {
    if (canUseKtx()) { toolUsed = 'ktx'; cmd = KTX; }
    else if (canUseToktx()) { toolUsed = 'toktx'; cmd = TOKTX; }
  } else {
    if (canUseToktx()) { toolUsed = 'toktx'; cmd = TOKTX; }
    else if (canUseKtx()) { toolUsed = 'ktx'; cmd = KTX; }
  }

  if (!cmd) {
    const why = PRIMARY_TOOL === 'ktx'
      ? 'unsupported by ktx and toktx not available'
      : 'unsupported by toktx and ktx not available';
    return { skipped: true, reason: why };
  }

  // Build argv now (compute ktx --format lazily)
  if (toolUsed === 'ktx') {
    const vkFormat = await determineKtxFormat(inFile);
    argv = buildKtxArgs(inFile, outFile, vkFormat);
  } else if (toolUsed === 'toktx') {
    const resizeGeom = await computeResizeGeometry(inFile);
    argv = buildToktxArgs(inFile, outFile, resizeGeom);
  }

  return new Promise((resolve) => {
    const p = spawn(cmd, argv, { stdio: 'inherit' });
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true, outFile, tool: toolUsed });
      else resolve({ ok: false, outFile, code, tool: toolUsed });
    });
  });
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

  const fallbackTool = PRIMARY_TOOL === 'ktx' ? (TOKTX ? 'toktx' : 'none') : (KTX ? 'ktx' : 'none');
  console.log(`Compressing images -> KTX2\n- input: ${INPUT_DIR}\n- outDir: ${OUT_DIR || '(side-by-side)'}\n- format: ${FORMAT}\n- mips: ${GEN_MIPS}\n- minKB: ${MIN_KB}\n- force: ${!!FORCE}\n- concurrency: ${CONCURRENCY}\n- tool: ${PRIMARY_TOOL} (fallback: ${fallbackTool})`);

  // Collect candidates
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

  console.log(`Found ${files.length} image(s).`);

  // Process with simple concurrency queue
  let idx = 0, active = 0, ok = 0, skipped = 0, failed = 0;
  const results = [];

  await new Promise((resolve) => {
    function kick() {
      while (active < CONCURRENCY && idx < files.length) {
        const inFile = files[idx++];
        active++;
        compressOne(inFile).then((res) => {
          results.push({ inFile, ...res });
          if (res.ok) ok++;
          else if (res.skipped || res.dry) skipped++;
          else failed++;
          active--;
          kick();
        });
      }
      if (active === 0 && idx >= files.length) resolve();
    }
    kick();
  });

  // Summary
  console.log('\nSummary:');
  for (const r of results) {
    const rel = path.relative(INPUT_DIR, r.inFile);
    if (r.ok) console.log(`✔ ${rel} -> ${r.outFile ? path.relative(OUT_DIR || path.dirname(r.inFile), r.outFile) : ''}${r.tool ? ` [${r.tool}]` : ''}`);
    else if (r.skipped) console.log(`• ${rel} (skipped: ${r.reason})`);
    else if (r.dry) console.log(`◦ ${rel} (dry-run)`);
    else console.log(`✖ ${rel} (code ${r.code ?? 'unknown'}${r.tool ? `, tool ${r.tool}` : ''})`);
  }
  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
