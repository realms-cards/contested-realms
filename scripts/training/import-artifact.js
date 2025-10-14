#!/usr/bin/env node
// Import a training artifact (theta + logs) into the local workspace.
// Usage:
//   node scripts/training/import-artifact.js --path artifacts/artifact_xxx
// Copies theta.json -> data/bots/params/champion.json and logs/* -> logs/training/*

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { path: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--path' || a === '-p') && argv[i + 1]) { out.path = String(argv[++i]); continue; }
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFileSafe(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

(async () => {
  const opts = parseArgs(process.argv);
  const base = opts.path ? path.resolve(opts.path) : null;
  if (!base || !fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    console.error('[import-artifact] Invalid --path.');
    process.exit(1);
  }

  const thetaSrc = path.join(base, 'theta.json');
  const logsSrc = path.join(base, 'logs');

  // Import theta
  if (fs.existsSync(thetaSrc)) {
    const thetaDst = path.join(process.cwd(), 'data', 'bots', 'params', 'champion.json');
    copyFileSafe(thetaSrc, thetaDst);
    console.log(`[import-artifact] Imported theta -> ${thetaDst}`);
  } else {
    console.log('[import-artifact] No theta.json found, skipping.');
  }

  // Import logs
  if (fs.existsSync(logsSrc) && fs.statSync(logsSrc).isDirectory()) {
    const logsDst = path.join(process.cwd(), 'logs', 'training');
    function copyDir(src, dst) {
      ensureDir(dst);
      for (const entry of fs.readdirSync(src)) {
        const s = path.join(src, entry);
        const d = path.join(dst, entry);
        const stat = fs.statSync(s);
        if (stat.isDirectory()) copyDir(s, d);
        else copyFileSafe(s, d);
      }
    }
    copyDir(logsSrc, logsDst);
    console.log(`[import-artifact] Imported logs -> ${logsDst}`);
  } else {
    console.log('[import-artifact] No logs directory found, skipping.');
  }

  console.log('[import-artifact] Done.');
})();
