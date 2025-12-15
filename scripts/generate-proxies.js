#!/usr/bin/env node
/**
 * Proxy Generator Script
 *
 * Generates printable A4 PDF sheets with high-quality card proxies.
 *
 * Usage:
 *   node scripts/generate-proxies.js --input cards.txt --output proxies.pdf
 *   node scripts/generate-proxies.js --slugs "bet-fireball-b-s,bet-lightning_bolt-b-s"
 *   node scripts/generate-proxies.js --names "Fireball,Lightning Bolt" --set beta
 *
 * Input file format (one per line):
 *   2 Fireball
 *   4 Lightning Bolt
 *   1 bet-dragon-b-s
 *
 * Card dimensions: 63.5mm x 88.9mm (standard trading card size)
 * A4 page: 210mm x 297mm
 * Layout: 3x3 grid (9 cards per page)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Try to load PDFKit - will be installed if missing
let PDFDocument;
try {
  PDFDocument = require("pdfkit");
} catch {
  console.error(
    "PDFKit not installed. Run: npm install pdfkit\nOr: npm install --save-dev pdfkit"
  );
  process.exit(1);
}

// Try to load sharp for image conversion (webp -> png)
let sharp;
try {
  sharp = require("sharp");
} catch {
  console.warn(
    "Sharp not installed. WebP images will be converted using fallback method."
  );
}

// Constants
const MM_TO_PT = 72 / 25.4; // 1 inch = 72 points, 1 inch = 25.4mm
const CARD_WIDTH_MM = 63.5;
const CARD_HEIGHT_MM = 88.9;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const CARD_WIDTH_PT = CARD_WIDTH_MM * MM_TO_PT;
const CARD_HEIGHT_PT = CARD_HEIGHT_MM * MM_TO_PT;
const A4_WIDTH_PT = A4_WIDTH_MM * MM_TO_PT;
const A4_HEIGHT_PT = A4_HEIGHT_MM * MM_TO_PT;

const CARDS_PER_ROW = 3;
const CARDS_PER_COL = 3;
const CARDS_PER_PAGE = CARDS_PER_ROW * CARDS_PER_COL;

// Calculate margins to center the grid
const GRID_WIDTH = CARDS_PER_ROW * CARD_WIDTH_PT;
const GRID_HEIGHT = CARDS_PER_COL * CARD_HEIGHT_PT;
const MARGIN_X = (A4_WIDTH_PT - GRID_WIDTH) / 2;
const MARGIN_Y = (A4_HEIGHT_PT - GRID_HEIGHT) / 2;

// Image sources - prioritize cardart/original for highest quality
const CDN_BASE = "https://cdn.realms.cards";
const CARDART_ORIGINAL_DIR = "cardart/original";
const LOCAL_DIRS = ["data-webp", "data"];
const SETS = [
  "beta",
  "alpha",
  "arthurian_legends",
  "dragonlord",
  "gothic",
  "promo",
];

// Load card data
let cardsData = null;
function loadCardsData() {
  if (cardsData) return cardsData;
  const cardsPath = path.join(__dirname, "..", "data", "cards_raw.json");
  if (fs.existsSync(cardsPath)) {
    cardsData = JSON.parse(fs.readFileSync(cardsPath, "utf-8"));
  } else {
    cardsData = [];
  }
  return cardsData;
}

// Convert card name to slug
function nameToSlug(name, preferredSet = "beta") {
  const cards = loadCardsData();
  const normalizedName = name.toLowerCase().trim();

  for (const card of cards) {
    if (card.name.toLowerCase() === normalizedName) {
      // Find variant in preferred set first
      for (const set of card.sets || []) {
        if (set.name.toLowerCase() === preferredSet.toLowerCase()) {
          const variant = (set.variants || []).find((v) =>
            v.slug.endsWith("-s")
          );
          if (variant) return variant.slug;
          if (set.variants?.[0]) return set.variants[0].slug;
        }
      }
      // Fallback to any set
      for (const set of card.sets || []) {
        const variant = (set.variants || []).find((v) => v.slug.endsWith("-s"));
        if (variant) return variant.slug;
        if (set.variants?.[0]) return set.variants[0].slug;
      }
    }
  }
  return null;
}

// Get set directory from slug
function setDirFromSlug(slug) {
  const code = slug.slice(0, 3);
  const map = {
    alp: "alpha",
    bet: "beta",
    art: "arthurian_legends",
    dra: "dragonlord",
    drl: "dragonlord",
    got: "gothic",
    gth: "gothic",
    pro: "promo",
  };
  return map[code] || null;
}

// Get image basename from slug
function imageBasenameFromSlug(slug) {
  return slug.replace(/^[a-z]{3}_/, "").replace(/^[a-z]{3}-/, "");
}

// Get suffix directory from basename (for alpha/beta/arthurian)
function suffixDirFromBasename(base) {
  const parts = base.split("_");
  if (parts.length < 3) return null;
  const a = parts[parts.length - 2];
  const b = parts[parts.length - 1];
  return `${a}_${b}`;
}

// Find local image file - prioritize cardart/original for highest quality
function findLocalImage(slug) {
  // cardart/original uses format: {set}-{cardname_with_underscores}-{variant}-{finish}.png
  // e.g., bet-lightning_bolt-b-s.png, alp-fireball-b-s.png

  // Normalize: ensure set prefix uses hyphen, card name keeps underscores
  // Input could be: bet_lightning_bolt_b_s OR bet-lightning_bolt-b-s
  const parts = slug.replace(/-/g, "_").split("_");
  if (parts.length >= 4) {
    // Reconstruct as: set-cardname_parts-variant-finish
    const setCode = parts[0];
    const finish = parts[parts.length - 1];
    const variant = parts[parts.length - 2];
    const cardNameParts = parts.slice(1, -2);
    const cardartSlug = `${setCode}-${cardNameParts.join(
      "_"
    )}-${variant}-${finish}`;

    const cardartDir = path.join(__dirname, "..", CARDART_ORIGINAL_DIR);
    const cardartPath = path.join(cardartDir, `${cardartSlug}.png`);
    if (fs.existsSync(cardartPath)) return cardartPath;
  }

  // Also try direct slug variations
  const hyphenSlug = slug.replace(/_/g, "-");
  const underscoreSlug = slug.replace(/-/g, "_");

  // 1. Check cardart/original with various slug formats
  const cardartDir = path.join(__dirname, "..", CARDART_ORIGINAL_DIR);
  for (const testSlug of [hyphenSlug, underscoreSlug, slug]) {
    const cardartPath = path.join(cardartDir, `${testSlug}.png`);
    if (fs.existsSync(cardartPath)) return cardartPath;
  }

  // 2. Fall back to data-webp/data directories
  const setDir = setDirFromSlug(slug);
  if (!setDir) return null;

  const normalizedSlug = underscoreSlug.replace(/^([a-z]{3})_/, "$1_");
  const base = imageBasenameFromSlug(normalizedSlug);
  const suffix = suffixDirFromBasename(base);
  const exts = ["webp", "png", "jpg", "jpeg"];

  for (const rootDir of LOCAL_DIRS) {
    const setPath = path.join(__dirname, "..", rootDir, setDir);

    // Try with suffix directory first (for alpha/beta/arthurian)
    if (suffix) {
      for (const ext of exts) {
        const filePath = path.join(setPath, suffix, `${base}.${ext}`);
        if (fs.existsSync(filePath)) return filePath;
      }
    }

    // Try without suffix
    for (const ext of exts) {
      const filePath = path.join(setPath, `${base}.${ext}`);
      if (fs.existsSync(filePath)) return filePath;
    }
  }

  return null;
}

// Build CDN URL for slug
function buildCdnUrl(slug) {
  const setDir = setDirFromSlug(slug);
  if (!setDir) return null;

  const normalizedSlug = slug.replace(/-/g, "_").replace(/^([a-z]{3})_/, "$1_");
  const base = imageBasenameFromSlug(normalizedSlug);
  const suffix = suffixDirFromBasename(base);

  // Sets that use suffix directories
  const setsWithSuffix = new Set(["alpha", "beta", "arthurian_legends"]);

  const pathParts =
    setsWithSuffix.has(setDir) && suffix
      ? ["data-webp", setDir, suffix, `${base}.webp`]
      : ["data-webp", setDir, `${base}.webp`];

  return `${CDN_BASE}/${pathParts.join("/")}`;
}

// Download image from URL
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (res) => {
        if (
          res.statusCode === 301 ||
          res.statusCode === 302 ||
          res.statusCode === 308
        ) {
          // Follow redirect
          downloadImage(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

// Convert image buffer to PNG (PDFKit only supports PNG/JPEG natively)
async function convertToPng(buffer, filename = "") {
  if (!sharp) {
    // Without sharp, hope it's already PNG/JPEG
    return buffer;
  }

  try {
    // Convert to PNG using sharp
    const pngBuffer = await sharp(buffer).png({ quality: 100 }).toBuffer();
    return pngBuffer;
  } catch (err) {
    console.warn(`  ⚠ Image conversion failed for ${filename}: ${err.message}`);
    return buffer;
  }
}

// Get image buffer (local or CDN)
async function getImageBuffer(slug, useCdn = false) {
  let buffer = null;
  let filename = "";

  // Try local first unless CDN is forced
  if (!useCdn) {
    const localPath = findLocalImage(slug);
    if (localPath) {
      console.log(`  ✓ Local: ${path.basename(localPath)}`);
      buffer = fs.readFileSync(localPath);
      filename = path.basename(localPath);
    }
  }

  // Try CDN if no local file
  if (!buffer) {
    const cdnUrl = buildCdnUrl(slug);
    if (cdnUrl) {
      try {
        console.log(`  ↓ CDN: ${slug}`);
        buffer = await downloadImage(cdnUrl);
        filename = `${slug}.webp`;
      } catch (err) {
        console.error(`  ✗ CDN failed for ${slug}: ${err.message}`);
      }
    }
  }

  if (!buffer) return null;

  // Convert to PNG for PDFKit compatibility
  return convertToPng(buffer, filename);
}

// Parse input file
function parseInputFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const cards = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Try to parse "N CardName" format
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (match) {
      const count = parseInt(match[1], 10);
      const nameOrSlug = match[2].trim();
      for (let i = 0; i < count; i++) {
        cards.push(nameOrSlug);
      }
    } else {
      // Single card (name or slug)
      cards.push(trimmed);
    }
  }

  return cards;
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: "proxies.pdf",
    slugs: [],
    names: [],
    set: "beta",
    cdn: false,
    bleed: false,
    cutLines: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--input":
      case "-i":
        options.input = args[++i];
        break;
      case "--output":
      case "-o":
        options.output = args[++i];
        break;
      case "--slugs":
      case "-s":
        options.slugs = args[++i].split(",").map((s) => s.trim());
        break;
      case "--names":
      case "-n":
        options.names = args[++i].split(",").map((s) => s.trim());
        break;
      case "--set":
        options.set = args[++i];
        break;
      case "--cdn":
        options.cdn = true;
        break;
      case "--no-cut-lines":
        options.cutLines = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Proxy Generator - Generate printable card proxy sheets

Usage:
  node scripts/generate-proxies.js [options]

Options:
  -i, --input <file>     Input file with card list (one per line, "N CardName" format)
  -o, --output <file>    Output PDF file (default: proxies.pdf)
  -s, --slugs <list>     Comma-separated list of card slugs
  -n, --names <list>     Comma-separated list of card names
  --set <name>           Preferred set for name lookups (default: beta)
  --cdn                  Force CDN download instead of local files
  --no-cut-lines         Disable cut line markers
  -h, --help             Show this help

Examples:
  node scripts/generate-proxies.js --input deck.txt --output my-proxies.pdf
  node scripts/generate-proxies.js --slugs "bet-fireball-b-s,bet-dragon-b-s"
  node scripts/generate-proxies.js --names "Fireball,Dragon" --set alpha

Input file format:
  4 Lightning Bolt
  2 Fireball
  1 bet-dragon-b-s
  # Comments start with #
`);
}

// Main function
async function main() {
  const options = parseArgs();

  // Collect all cards
  let cards = [];

  if (options.input) {
    const inputPath = path.isAbsolute(options.input)
      ? options.input
      : path.join(process.cwd(), options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
    }
    cards = parseInputFile(inputPath);
  }

  if (options.slugs.length) {
    cards.push(...options.slugs);
  }

  if (options.names.length) {
    cards.push(...options.names);
  }

  if (!cards.length) {
    console.error("No cards specified. Use --input, --slugs, or --names.");
    printHelp();
    process.exit(1);
  }

  console.log(`\nGenerating proxies for ${cards.length} card(s)...\n`);

  // Convert names to slugs
  const slugs = [];
  for (const card of cards) {
    // Check if it's already a slug (has set prefix)
    if (/^[a-z]{3}[-_]/.test(card)) {
      slugs.push(card);
    } else {
      const slug = nameToSlug(card, options.set);
      if (slug) {
        slugs.push(slug);
      } else {
        console.warn(`  ⚠ Card not found: "${card}"`);
      }
    }
  }

  if (!slugs.length) {
    console.error("No valid cards found.");
    process.exit(1);
  }

  // Fetch all images
  console.log("Fetching images...");
  const images = [];
  for (const slug of slugs) {
    const buffer = await getImageBuffer(slug, options.cdn);
    if (buffer) {
      images.push({ slug, buffer });
    } else {
      console.warn(`  ⚠ Image not found for: ${slug}`);
    }
  }

  if (!images.length) {
    console.error("No images found.");
    process.exit(1);
  }

  // Create PDF
  console.log(`\nCreating PDF with ${images.length} card(s)...`);
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
  });

  const outputPath = path.isAbsolute(options.output)
    ? options.output
    : path.join(process.cwd(), options.output);
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Process cards in batches of 9 (one page)
  const totalPages = Math.ceil(images.length / CARDS_PER_PAGE);
  for (let page = 0; page < totalPages; page++) {
    doc.addPage();

    const startIdx = page * CARDS_PER_PAGE;
    const pageImages = images.slice(startIdx, startIdx + CARDS_PER_PAGE);

    // Draw cut lines if enabled
    if (options.cutLines) {
      doc.strokeColor("#cccccc").lineWidth(0.5);

      // Vertical lines
      for (let col = 0; col <= CARDS_PER_ROW; col++) {
        const x = MARGIN_X + col * CARD_WIDTH_PT;
        doc
          .moveTo(x, MARGIN_Y - 10)
          .lineTo(x, MARGIN_Y + GRID_HEIGHT + 10)
          .stroke();
      }

      // Horizontal lines
      for (let row = 0; row <= CARDS_PER_COL; row++) {
        const y = MARGIN_Y + row * CARD_HEIGHT_PT;
        doc
          .moveTo(MARGIN_X - 10, y)
          .lineTo(MARGIN_X + GRID_WIDTH + 10, y)
          .stroke();
      }
    }

    // Place cards
    for (let i = 0; i < pageImages.length; i++) {
      const { buffer } = pageImages[i];
      const row = Math.floor(i / CARDS_PER_ROW);
      const col = i % CARDS_PER_ROW;

      const x = MARGIN_X + col * CARD_WIDTH_PT;
      const y = MARGIN_Y + row * CARD_HEIGHT_PT;

      try {
        doc.image(buffer, x, y, {
          width: CARD_WIDTH_PT,
          height: CARD_HEIGHT_PT,
          fit: [CARD_WIDTH_PT, CARD_HEIGHT_PT],
          align: "center",
          valign: "center",
        });
      } catch (err) {
        console.error(`  ✗ Failed to embed image: ${err.message}`);
      }
    }

    console.log(
      `  Page ${page + 1}/${totalPages} (${pageImages.length} cards)`
    );
  }

  doc.end();

  await new Promise((resolve) => stream.on("finish", resolve));

  console.log(`\n✓ PDF saved to: ${outputPath}`);
  console.log(`  ${images.length} cards on ${totalPages} page(s)`);
  console.log(`  Card size: ${CARD_WIDTH_MM}mm × ${CARD_HEIGHT_MM}mm`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
