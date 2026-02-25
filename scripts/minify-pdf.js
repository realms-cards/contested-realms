#!/usr/bin/env node
/*
  Minify a PDF using Ghostscript.

  Modes:
  - aggressive (default): heavy downsampling + compression
  - no-images: removes raster images entirely (smallest output if images are not needed)

  Usage:
    node scripts/minify-pdf.js --input ./in.pdf
    node scripts/minify-pdf.js --input ./in.pdf --output ./out.pdf --mode no-images

  Note:
    Requires Ghostscript (`gs`) installed.
    macOS: brew install ghostscript
*/

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);

function getFlag(name, def) {
  const i = args.findIndex(
    (a) => a === `--${name}` || a.startsWith(`--${name}=`)
  );
  if (i === -1) return def;
  const a = args[i];
  const eq = a.indexOf("=");
  if (eq !== -1) return a.slice(eq + 1);
  const next = args[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fail(message) {
  console.error(`\nError: ${message}`);
  process.exit(1);
}

const input = getFlag("input", null);
const mode = String(getFlag("mode", "aggressive")).toLowerCase();

if (!input) {
  fail("Missing --input path. Example: --input ./document.pdf");
}

if (!fs.existsSync(input)) {
  fail(`Input file not found: ${input}`);
}

if (path.extname(input).toLowerCase() !== ".pdf") {
  fail("Input file must be a .pdf");
}

if (!["aggressive", "no-images"].includes(mode)) {
  fail("--mode must be one of: aggressive, no-images");
}

const inputPath = path.resolve(input);
const outputFlag = getFlag("output", null);
const defaultOutputName = `${path.basename(inputPath, ".pdf")}.min.${mode}.pdf`;
const outputPath = path.resolve(
  outputFlag || path.join(path.dirname(inputPath), defaultOutputName)
);

const commonGsArgs = [
  "-sDEVICE=pdfwrite",
  "-dCompatibilityLevel=1.4",
  "-dNOPAUSE",
  "-dBATCH",
  "-dSAFER",
  "-dQUIET",
  "-dDetectDuplicateImages=true",
  "-dCompressFonts=true",
  "-dSubsetFonts=true",
  "-dAutoRotatePages=/None",
  "-dPDFSETTINGS=/screen",
  "-dDownsampleColorImages=true",
  "-dColorImageDownsampleType=/Bicubic",
  "-dColorImageResolution=36",
  "-dDownsampleGrayImages=true",
  "-dGrayImageDownsampleType=/Bicubic",
  "-dGrayImageResolution=36",
  "-dDownsampleMonoImages=true",
  "-dMonoImageDownsampleType=/Subsample",
  "-dMonoImageResolution=72",
];

if (mode === "no-images") {
  // Drop all raster images (best size reduction when images are unnecessary).
  commonGsArgs.push("-dFILTERIMAGE");
}

commonGsArgs.push(`-sOutputFile=${outputPath}`, inputPath);

console.log("=== PDF Minifier ===");
console.log(`Input : ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Mode  : ${mode}`);

const run = spawnSync("gs", commonGsArgs, { stdio: "pipe", encoding: "utf8" });

if (run.error) {
  if (run.error.code === "ENOENT") {
    fail("Ghostscript binary not found (`gs`). Install with: brew install ghostscript");
  }
  fail(run.error.message || "Failed to run Ghostscript");
}

if (run.status !== 0) {
  console.error(run.stderr || run.stdout || "Ghostscript failed");
  fail(`Ghostscript exited with code ${run.status}`);
}

if (!fs.existsSync(outputPath)) {
  fail("Ghostscript completed but output file was not created");
}

const inSize = fs.statSync(inputPath).size;
const outSize = fs.statSync(outputPath).size;
const saved = inSize - outSize;
const pct = inSize > 0 ? ((saved / inSize) * 100).toFixed(1) : "0.0";

console.log("\nDone.");
console.log(`Before: ${formatBytes(inSize)}`);
console.log(`After : ${formatBytes(outSize)}`);
console.log(`Saved : ${formatBytes(saved)} (${pct}%)`);
