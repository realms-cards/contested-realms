#!/usr/bin/env node
/**
 * Card Scanner Training Data Preparation
 *
 * Downloads card images and prepares them for model training.
 * Creates a dataset structure compatible with TensorFlow/Keras.
 *
 * Usage: node scripts/scanner/prepare-training-data.js [options]
 *   --output-dir    Output directory (default: data/scanner-training)
 *   --cdn-origin    CDN origin (default: from env or https://cdn.realms.cards)
 *   --card-level    Group by card name instead of variant slug (default: true)
 *   --set           Filter to specific set: alpha, beta, arthurian, dragonlord (default: all)
 *   --limit         Limit number of cards (for testing)
 *   --concurrency   Download concurrency (default: 10)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Parse args
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
};

const OUTPUT_DIR = getArg("output-dir", "data/scanner-training");
const LOCAL_IMAGES = getArg("local", "true") === "true"; // Use local images by default
const CDN_ORIGIN = getArg(
  "cdn-origin",
  process.env.NEXT_PUBLIC_TEXTURE_ORIGIN || "https://cdn.realms.cards"
);
const CARD_LEVEL = getArg("card-level", "true") === "true";
const LOCAL_DATA_DIR = path.join(__dirname, "../../data"); // PNG files
const SET_FILTER = getArg("set", ""); // alpha, beta, arthurian, dragonlord, or empty for all
const LIMIT = parseInt(getArg("limit", "0"), 10);
const CONCURRENCY = parseInt(getArg("concurrency", "10"), 10);

// Map set names to their codes
const SET_NAME_TO_CODE = {
  Alpha: "alp",
  Beta: "bet",
  "Arthurian Legends": "art",
  Arthurian: "art",
  Dragonlord: "drl",
  Gothic: "got",
};

const CARDS_RAW_PATH = path.join(__dirname, "../../data/cards_raw.json");

// Set code mapping
const SET_CODES = {
  Alpha: "alp",
  Beta: "bet",
  "Arthurian Legends": "art",
  Dragonlord: "drl",
  Gothic: "got",
};

const SET_DIRS = {
  alp: "alpha",
  bet: "beta",
  art: "arthurian_legends",
  drl: "dragonlord",
  got: "gothic",
};

// Sets that use flat structure (no subdirectories)
const FLAT_SETS = ["got", "drl"];

function slugToLocalPath(slug) {
  const code = slug.slice(0, 3);
  const setDir = SET_DIRS[code];
  if (!setDir) return null;

  // Slug format: "alp-apprentice_wizard-b-s" -> remove set prefix and convert to underscore format
  // Result should be: "apprentice_wizard_b_s.png"
  const withoutPrefix = slug.replace(/^[a-z]{3}-/, ""); // "apprentice_wizard-b-s"
  const parts = withoutPrefix.split("-");
  const finishCode = parts.slice(-2).join("_"); // "b_s"
  const cardName = parts.slice(0, -2).join("-"); // "apprentice_wizard"
  const filename = `${cardName}_${finishCode}.png`; // "apprentice_wizard_b_s.png"

  // Gothic and Dragonlord use flat structure, others use subdirectories
  if (FLAT_SETS.includes(code)) {
    // Flat: data/{set}/{filename}.png
    return path.join(LOCAL_DATA_DIR, setDir, filename);
  } else {
    // Subdirectory: data/{set}/{finish}/{filename}.png
    return path.join(LOCAL_DATA_DIR, setDir, finishCode, filename);
  }
}

function slugToImageUrl(slug) {
  const code = slug.slice(0, 3);
  const setDir = SET_DIRS[code];
  if (!setDir) return null;

  const base = slug.replace(/^[a-z]{3}_/, "");
  // Use webp format
  return `${CDN_ORIGIN}/data-webp/${setDir}/${base}.webp`;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function linkLocalFile(srcPath, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Use symlink - no copying needed!
  if (!fs.existsSync(destPath)) {
    fs.symlinkSync(srcPath, destPath);
  }
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    const request = protocol.get(url, (response) => {
      if (
        response.statusCode === 301 ||
        response.statusCode === 302 ||
        response.statusCode === 308
      ) {
        // Follow redirect
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
      file.on("error", reject);
    });

    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Timeout for ${url}`));
    });
  });
}

async function processWithConcurrency(items, fn, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

async function main() {
  console.log("📦 Card Scanner Training Data Preparation");
  console.log("=========================================");
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`CDN: ${CDN_ORIGIN}`);
  console.log(`Group by: ${CARD_LEVEL ? "card name" : "variant slug"}`);
  console.log(`Set filter: ${SET_FILTER || "all sets"}`);
  console.log();

  // Load cards
  if (!fs.existsSync(CARDS_RAW_PATH)) {
    console.error("❌ cards_raw.json not found. Run: npm run ingest:cards");
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(CARDS_RAW_PATH, "utf-8"));
  console.log(`📚 Loaded ${cards.length} cards`);

  // Build download list
  const downloads = [];
  const labelMap = new Map(); // label -> class index
  let classIndex = 0;

  for (const card of cards) {
    const cardName = card.name;
    const sanitizedName = sanitizeFilename(cardName);

    for (const set of card.sets || []) {
      // Apply set filter if specified
      if (SET_FILTER) {
        const setCode = SET_NAME_TO_CODE[set.name];
        const filterCode = SET_FILTER.toLowerCase().slice(0, 3);
        if (
          setCode !== filterCode &&
          SET_NAME_TO_CODE[SET_FILTER] !== setCode
        ) {
          continue;
        }
      }

      for (const variant of set.variants || []) {
        const slug = variant.slug;
        const localPath = slugToLocalPath(slug);
        const imageUrl = slugToImageUrl(slug);

        // Skip if no valid path
        if (LOCAL_IMAGES && !localPath) continue;
        if (!LOCAL_IMAGES && !imageUrl) continue;

        // Determine label (card name or variant slug)
        const label = CARD_LEVEL ? sanitizedName : slug;

        if (!labelMap.has(label)) {
          labelMap.set(label, classIndex++);
        }

        downloads.push({
          url: imageUrl,
          localPath,
          label,
          slug,
          cardName,
          set: set.name,
          finish: variant.finish,
        });
      }
    }
  }

  // Apply limit if specified
  const toDownload = LIMIT > 0 ? downloads.slice(0, LIMIT) : downloads;
  console.log(
    `📷 ${toDownload.length} images to ${LOCAL_IMAGES ? "link" : "download"} (${
      labelMap.size
    } classes)`
  );

  // Create output directories
  const imagesDir = path.join(OUTPUT_DIR, "images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Download images
  let completed = 0;
  let failed = 0;
  const errors = [];

  await processWithConcurrency(
    toDownload,
    async (item, idx) => {
      const destDir = path.join(imagesDir, item.label);
      const destFile = path.join(destDir, `${item.slug}.png`);

      // Skip if already exists
      if (fs.existsSync(destFile)) {
        completed++;
        return { success: true, skipped: true };
      }

      try {
        if (LOCAL_IMAGES && item.localPath) {
          // Check if local file exists
          if (!fs.existsSync(item.localPath)) {
            throw new Error(`Local file not found: ${item.localPath}`);
          }
          linkLocalFile(item.localPath, destFile);
        } else {
          await downloadFile(item.url, destFile);
        }
        completed++;

        if (completed % 50 === 0) {
          process.stdout.write(
            `\r⬇️  Downloaded ${completed}/${toDownload.length}...`
          );
        }

        return { success: true };
      } catch (err) {
        failed++;
        errors.push({ slug: item.slug, error: err.message });
        return { success: false, error: err.message };
      }
    },
    CONCURRENCY
  );

  console.log(`\n✅ Downloaded ${completed} images (${failed} failed)`);

  // Write label map
  const labelMapPath = path.join(OUTPUT_DIR, "labels.json");
  const labelMapData = {
    cardLevel: CARD_LEVEL,
    numClasses: labelMap.size,
    labels: Object.fromEntries(labelMap),
    indexToLabel: Object.fromEntries(
      [...labelMap.entries()].map(([k, v]) => [v, k])
    ),
  };
  fs.writeFileSync(labelMapPath, JSON.stringify(labelMapData, null, 2));
  console.log(`📝 Wrote label map to ${labelMapPath}`);

  // Write metadata
  const metadataPath = path.join(OUTPUT_DIR, "metadata.json");
  const metadata = {
    createdAt: new Date().toISOString(),
    totalImages: completed,
    numClasses: labelMap.size,
    cardLevel: CARD_LEVEL,
    cdnOrigin: CDN_ORIGIN,
    downloads: toDownload.map((d) => ({
      slug: d.slug,
      label: d.label,
      cardName: d.cardName,
      set: d.set,
      finish: d.finish,
    })),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`📝 Wrote metadata to ${metadataPath}`);

  // Write errors if any
  if (errors.length > 0) {
    const errorsPath = path.join(OUTPUT_DIR, "errors.json");
    fs.writeFileSync(errorsPath, JSON.stringify(errors, null, 2));
    console.log(`⚠️  ${errors.length} errors logged to ${errorsPath}`);
  }

  console.log("\n🎉 Training data preparation complete!");
  console.log(`\nNext steps:`);
  console.log(`  1. Run training: python scripts/scanner/train-model.py`);
  console.log(
    `  2. Convert model: tensorflowjs_converter --input_format=keras model.h5 public/models/card-scanner/`
  );
}

main().catch(console.error);
