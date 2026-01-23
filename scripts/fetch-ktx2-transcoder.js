#!/usr/bin/env node
/**
 * Fetch BasisU KTX2 transcoder files matching the installed three.js version
 * into public/ktx2/ so we can self-host them in production builds.
 *
 * Sources:
 *   https://unpkg.com/three@<version>/examples/jsm/libs/basis/
 * Files:
 *   - basis_transcoder.js
 *   - basis_transcoder.wasm
 *   - basis_transcoder.wasm.js (some builds)
 *   - basis_transcoder.wasm.wasm (some builds)
 */
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const https = require("node:https");

async function readPackageJson() {
  const pkgPath = path.resolve(process.cwd(), "package.json");
  const raw = await fsp.readFile(pkgPath, "utf8");
  return JSON.parse(raw);
}

function resolveThreeVersion(pkg) {
  const ver =
    (pkg.dependencies && pkg.dependencies.three) ||
    (pkg.devDependencies && pkg.devDependencies.three);
  if (!ver) return "latest";
  // strip leading ^ or ~
  return String(ver).replace(/^\^|~/, "");
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // handle redirect
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(true)));
      })
      .on("error", reject);
  });
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function maybeFetch(baseUrl, filename, outDir) {
  const url = `${baseUrl}${filename}`;
  const dest = path.join(outDir, filename);

  // Skip if file already exists (e.g., committed to repo)
  try {
    await fsp.access(dest);
    console.log(`Skip ${filename}: already exists`);
    return true;
  } catch {
    // File doesn't exist, proceed to download
  }

  try {
    await download(url, dest);
    console.log(`Fetched ${filename}`);
    return true;
  } catch (e) {
    console.log(`Skip ${filename}: ${e.message}`);
    return false;
  }
}

async function main() {
  try {
    const pkg = await readPackageJson();
    const threeVer = resolveThreeVersion(pkg);
    const baseUrl = `https://unpkg.com/three@${threeVer}/examples/jsm/libs/basis/`;
    const outDir = path.resolve(process.cwd(), "public", "ktx2");
    await ensureDir(outDir);

    const files = ["basis_transcoder.js", "basis_transcoder.wasm"];

    let okAny = false;
    for (const f of files) {
      const ok = await maybeFetch(baseUrl, f, outDir);
      okAny = okAny || ok;
    }
    if (!okAny) {
      console.warn(
        "No KTX2 transcoder files fetched. Check network or three version."
      );
    }
  } catch (e) {
    console.warn("fetch-ktx2-transcoder failed:", e.message);
    process.exitCode = 0; // don’t fail the build
  }
}

main();
