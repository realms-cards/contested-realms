#!/usr/bin/env node
// Export a training artifact containing theta and JSONL logs.
// Usage:
//   node scripts/training/export-artifact.js \
//     --theta data/bots/params/champion.json \
//     --name champion-YYYYMMDD-HHMMSS \
//     [--logsDir logs/training]

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { theta: null, name: null, logsDir: path.join(process.cwd(), 'logs', 'training') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--theta' && argv[i + 1]) { out.theta = String(argv[++i]); continue; }
    if (a === '--name' && argv[i + 1]) { out.name = String(argv[++i]); continue; }
    if (a === '--logsDir' && argv[i + 1]) { out.logsDir = String(argv[++i]); continue; }
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
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const name = opts.name || `artifact_${stamp}`;
  const base = path.join(process.cwd(), 'artifacts', name);
  ensureDir(base);

  // Resolve theta path
  let thetaPath = opts.theta;
  if (!thetaPath) {
    const defaultTheta = path.join(process.cwd(), 'data', 'bots', 'params', 'champion.json');
    if (fs.existsSync(defaultTheta)) thetaPath = defaultTheta;
  }

  // Copy theta if present
  if (thetaPath && fs.existsSync(thetaPath)) {
    copyFileSafe(thetaPath, path.join(base, 'theta.json'));
  }

  // Copy logs recursively if folder exists
  const logsSrc = opts.logsDir;
  const logsDst = path.join(base, 'logs');
  if (logsSrc && fs.existsSync(logsSrc) && fs.statSync(logsSrc).isDirectory()) {
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
  }

  // Write manifest
  const manifest = {
    name,
    createdAt: now.toISOString(),
    theta: fs.existsSync(path.join(base, 'theta.json')) ? 'theta.json' : null,
    logsRoot: fs.existsSync(logsDst) ? 'logs' : null,
    notes: 'Import with scripts/training/import-artifact.js to set champion params and bring logs.'
  };
  fs.writeFileSync(path.join(base, 'artifact.json'), JSON.stringify(manifest, null, 2));

  console.log(`[export-artifact] Created artifact at ${base}`);
})();
