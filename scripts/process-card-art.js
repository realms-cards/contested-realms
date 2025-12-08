#!/usr/bin/env node
/*
  Process card art from cardart/original into the data/ directory structure.
  
  This script handles the naming convention change from Curiosa's API:
  - New filenames use dashes: alp-abundance-b-f.png
  - Old DB slugs use underscores: alp_abundance_b_f
  
  The script normalizes filenames to match the DB slug format.
  
  Usage:
    node scripts/process-card-art.js
    node scripts/process-card-art.js --input cardart/original --outDir data
    node scripts/process-card-art.js --dryRun
    node scripts/process-card-art.js --set gothic  # Only process gothic set
    node scripts/process-card-art.js --force       # Overwrite existing files
    
  After processing to data/, run:
    npm run assets:webp:out   # Generate WebP versions in data-webp/
    npm run assets:compress:out  # Generate KTX2 versions in data-ktx2/
*/

const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");

// --------- CLI args ---------
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

const INPUT_DIR = path.resolve(String(getFlag("input", "cardart/original")));
const OUT_DIR = path.resolve(String(getFlag("outDir", "data")));
const DRY_RUN = Boolean(getFlag("dryRun", false));
const FORCE = Boolean(getFlag("force", false));
const SET_FILTER = getFlag("set", null);

// Set prefix mappings
const SET_PREFIXES = {
  alp: "alpha",
  bet: "beta",
  arl: "arthurian_legends",
  art: "arthurian_legends",
  drl: "dragonlord",
  dra: "dragonlord",
  got: "gothic",
  gth: "gothic",
  pro: "promo", // Organized Play / Promo cards
};

/**
 * Convert new-style filename to DB slug format
 * Input:  alp-abundance-b-f.png
 * Output: alp_abundance_b_f
 */
function filenameToSlug(filename) {
  // Remove extension
  const base = filename.replace(/\.[^.]+$/, "");

  // Extract set prefix (first 3 chars)
  const prefix = base.slice(0, 3).toLowerCase();

  // Check if it uses new dash format or old underscore format
  if (base.charAt(3) === "-") {
    // New format: alp-card_name-b-f
    // Convert first dash to underscore, keep rest as-is but convert final dashes
    const rest = base.slice(4);
    // The pattern is: cardname-finish-variant (e.g., abundance-b-f)
    // We need: cardname_finish_variant (e.g., abundance_b_f)
    const parts = rest.split("-");
    if (parts.length >= 3) {
      // Last two parts are finish/variant (b, f or s)
      const finish = parts[parts.length - 2];
      const variant = parts[parts.length - 1];
      const cardName = parts.slice(0, -2).join("_");
      return `${prefix}_${cardName}_${finish}_${variant}`;
    }
    // Fallback: just replace all dashes with underscores
    return `${prefix}_${rest.replace(/-/g, "_")}`;
  } else if (base.charAt(3) === "_") {
    // Already in old format
    return base.toLowerCase();
  }

  // Unknown format, return as-is
  return base.toLowerCase();
}

/**
 * Get set directory from slug prefix
 */
function getSetDir(slug) {
  const prefix = slug.slice(0, 3).toLowerCase();
  return SET_PREFIXES[prefix] || null;
}

/**
 * Get suffix directory from slug (e.g., b_s, b_f)
 */
function getSuffixDir(slug) {
  const parts = slug.split("_");
  if (parts.length < 3) return null;
  const a = parts[parts.length - 2];
  const b = parts[parts.length - 1];
  return `${a}_${b}`;
}

async function* walkDir(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function processFile(inputPath) {
  const filename = path.basename(inputPath);
  const ext = path.extname(filename).toLowerCase();

  // Only process image files
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return { skipped: true, reason: "not an image", file: filename };
  }

  const slug = filenameToSlug(filename);
  const setDir = getSetDir(slug);

  if (!setDir) {
    return {
      skipped: true,
      reason: "unknown set prefix",
      file: filename,
      slug,
    };
  }

  // Apply set filter if specified
  if (SET_FILTER && !setDir.includes(SET_FILTER.toLowerCase())) {
    return { skipped: true, reason: "filtered out", file: filename };
  }

  const suffix = getSuffixDir(slug);
  const imageBasename = slug.replace(/^[a-z]{3}_/, "");

  // Build output path: data/{set}/{suffix}/{basename}.png
  // or data/{set}/{basename}.png if no suffix dirs for this set
  const outputFilename = `${imageBasename}${ext}`;
  let outputPath;

  // Sets that use suffix directories (b_s, b_f, etc.)
  const setsWithSuffix = new Set(["alpha", "beta", "arthurian_legends"]);

  if (suffix && setsWithSuffix.has(setDir)) {
    outputPath = path.join(OUT_DIR, setDir, suffix, outputFilename);
  } else {
    outputPath = path.join(OUT_DIR, setDir, outputFilename);
  }

  // Check if output exists
  if (!FORCE) {
    try {
      await fsp.access(outputPath);
      return {
        skipped: true,
        reason: "exists",
        file: filename,
        output: outputPath,
      };
    } catch {
      // File doesn't exist, proceed
    }
  }

  if (DRY_RUN) {
    return { dry: true, file: filename, slug, output: outputPath };
  }

  // Create output directory
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  // Copy file
  await fsp.copyFile(inputPath, outputPath);

  return { ok: true, file: filename, slug, output: outputPath };
}

async function main() {
  console.log("=== Card Art Processor ===");
  console.log(`Input:  ${INPUT_DIR}`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Mode:   ${DRY_RUN ? "DRY RUN" : FORCE ? "FORCE" : "normal"}`);
  if (SET_FILTER) console.log(`Filter: ${SET_FILTER}`);
  console.log("");

  // Check input directory
  try {
    const stat = await fsp.stat(INPUT_DIR);
    if (!stat.isDirectory()) throw new Error("Not a directory");
  } catch {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  const results = { ok: 0, skipped: 0, dry: 0, errors: [] };
  const processed = [];

  for await (const file of walkDir(INPUT_DIR)) {
    try {
      const result = await processFile(file);
      if (result.ok) {
        results.ok++;
        processed.push(result);
      } else if (result.dry) {
        results.dry++;
        processed.push(result);
      } else if (result.skipped) {
        results.skipped++;
      }
    } catch (err) {
      results.errors.push({ file, error: err.message });
    }
  }

  // Print summary
  console.log("\n--- Summary ---");
  if (processed.length > 0) {
    console.log("\nProcessed files:");
    for (const p of processed.slice(0, 20)) {
      const relOut = path.relative(OUT_DIR, p.output);
      console.log(`  ${p.dry ? "○" : "✓"} ${p.file} → ${relOut}`);
    }
    if (processed.length > 20) {
      console.log(`  ... and ${processed.length - 20} more`);
    }
  }

  if (results.errors.length > 0) {
    console.log("\nErrors:");
    for (const e of results.errors) {
      console.log(`  ✗ ${path.basename(e.file)}: ${e.error}`);
    }
  }

  console.log(
    `\nTotal: ${results.ok} copied, ${results.dry} dry, ${results.skipped} skipped, ${results.errors.length} errors`
  );

  if (results.ok > 0 || results.dry > 0) {
    console.log("\n--- Next Steps ---");
    console.log("1. After Gothic art is ready, run with Gothic filter:");
    console.log("   node scripts/process-card-art.js --set gothic");
    console.log("");
    console.log("2. Generate optimized formats:");
    console.log("   npm run assets:webp:out     # WebP for browsers");
    console.log("   npm run assets:compress:out # KTX2 for 3D");
    console.log("");
    console.log("3. Upload to CDN (data-webp/, data-ktx2/ folders)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
