/*
  Sync the vendored sorcery-registry export and rebuild the runtime index.

  The registry (https://github.com/sadkinglabs/sorcery-registry) assigns stable
  ids to every card (codex_id) and printing (printing_id) so our lookups survive
  upstream renames and set renumbering. Slugs are treated as mutable data.

  Usage:
    node scripts/registry/sync-registry.js            # rebuild index from the vendored copy
    node scripts/registry/sync-registry.js --download # refetch registry.json first
*/
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RAW_BASE =
  "https://raw.githubusercontent.com/sadkinglabs/sorcery-registry/main/export";
const DIR = path.join(__dirname, "..", "..", "data", "registry");
const REGISTRY = path.join(DIR, "registry.json");
const CHECKSUM = path.join(DIR, "registry.json.sha256");
const INDEX = path.join(DIR, "printing-index.json");
// Kept separate so the image route can bundle 11 entries instead of 3k slugs
const ART_FALLBACK = path.join(DIR, "art-fallback.json");

/**
 * Our variant slugs predate the set renumbering and use a 3-letter set prefix
 * (`alp-detonate-b-s`); the registry and the live API use the set number
 * (`001-detonate-b-s`). Only the leading segment differs.
 */
const SET_PREFIX_OVERRIDES = { promotional: "pro", promo: "pro" };

function legacyPrefix(setName) {
  const key = String(setName || "").trim().toLowerCase();
  return SET_PREFIX_OVERRIDES[key] || key.slice(0, 3);
}

function toLegacySlug(slug, setName) {
  const dash = String(slug).indexOf("-");
  const prefix = legacyPrefix(setName);
  if (dash <= 0 || !prefix) return null;
  return `${prefix}${slug.slice(dash)}`;
}

/**
 * Mirrors the CDN layout that src/app/api/images/[slug] serves from, so we can
 * tell which printings we actually hold art for.
 */
const SET_DIRS = {
  "001": "alpha",
  "002": "beta",
  "004": "arthurian_legends",
  "005": "dragonlord",
  "006": "gothic",
  "999": "promo",
};
const ASSET_ROOT = path.join(__dirname, "..", "..", "data-webp");

/** `004-foot_soldier-bt-s` -> { dir: "arthurian_legends", base: "foot_soldier_bt_s" } */
function assetLocation(printing) {
  const dir = SET_DIRS[printing.set_number];
  if (!dir) return null;
  const dash = printing.slug.indexOf("-");
  if (dash <= 0) return null;
  return { dir, base: printing.slug.slice(dash + 1).replace(/-/g, "_") };
}

/** Collect every card image we hold, as "<setDir>/<basename>" */
function scanAssets() {
  if (!fs.existsSync(ASSET_ROOT)) return null;
  const held = new Set();
  const tokens = new Set();
  for (const dir of [...new Set(Object.values(SET_DIRS)), "tokens"]) {
    const root = path.join(ASSET_ROOT, dir);
    if (!fs.existsSync(root)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".webp")) {
          const base = e.name.slice(0, -".webp".length);
          if (dir === "tokens") tokens.add(base);
          else held.add(`${dir}/${base}`);
        }
      }
    };
    walk(root);
  }
  return { held, tokens };
}

/**
 * Some printings exist upstream but we hold no art for them (new promo foils,
 * renamed box toppers). Rather than 404, fall back to another printing of the
 * same card, then to the generic token art. Stable codex ids are what make
 * "another printing of the same card" answerable at all.
 */
function buildArtFallbacks(registry, assets) {
  const byCodex = new Map();
  for (const p of registry.printings) {
    if (!byCodex.has(p.codex_id)) byCodex.set(p.codex_id, []);
    byCodex.get(p.codex_id).push(p);
  }

  const fallbacks = {};
  const unresolved = [];
  for (const p of registry.printings) {
    const loc = assetLocation(p);
    if (!loc || assets.held.has(`${loc.dir}/${loc.base}`)) continue;

    const siblings = (byCodex.get(p.codex_id) || [])
      .filter((q) => {
        const l = assetLocation(q);
        return l && assets.held.has(`${l.dir}/${l.base}`);
      })
      // Prefer the same set, then the plainest printing (Standard Booster)
      .sort(
        (a, b) =>
          Number(a.set_number !== p.set_number) -
            Number(b.set_number !== p.set_number) ||
          Number(a.finish !== "Standard") - Number(b.finish !== "Standard") ||
          Number(a.product !== "Booster") - Number(b.product !== "Booster") ||
          a.slug.localeCompare(b.slug)
      );

    const missingSlug = toLegacySlug(p.slug, p.set_name).replace(/-/g, "_");
    const sibling = siblings[0];
    if (sibling) {
      fallbacks[missingSlug] = {
        slug: toLegacySlug(sibling.slug, sibling.set_name).replace(/-/g, "_"),
        reason: "sibling-printing",
      };
      continue;
    }

    // Last resort: the generic token art, keyed by card name (e.g. "Skeleton")
    const token = p.card_name.replace(/\s+/g, "_");
    if (assets.tokens.has(token)) {
      fallbacks[missingSlug] = { token, reason: "token-art" };
    } else {
      unresolved.push(`${p.slug} (${p.card_name})`);
    }
  }
  return { fallbacks, unresolved };
}

async function download() {
  const [jsonRes, shaRes] = await Promise.all([
    fetch(`${RAW_BASE}/registry.json`),
    fetch(`${RAW_BASE}/registry.json.sha256`),
  ]);
  if (!jsonRes.ok) throw new Error(`registry.json: HTTP ${jsonRes.status}`);
  if (!shaRes.ok) throw new Error(`checksum: HTTP ${shaRes.status}`);
  const body = Buffer.from(await jsonRes.arrayBuffer());
  const shaLine = await shaRes.text();
  const expected = shaLine.trim().split(/\s+/)[0];
  const actual = crypto.createHash("sha256").update(body).digest("hex");
  if (expected !== actual) {
    throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`);
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(REGISTRY, body);
  fs.writeFileSync(CHECKSUM, shaLine);
  console.log(`Downloaded registry.json (${body.length} bytes), checksum OK`);
}

function buildIndex() {
  const body = fs.readFileSync(REGISTRY);
  const registry = JSON.parse(body.toString("utf8"));

  // Verify the vendored copy still matches its recorded checksum
  if (fs.existsSync(CHECKSUM)) {
    const expected = fs.readFileSync(CHECKSUM, "utf8").trim().split(/\s+/)[0];
    const actual = crypto.createHash("sha256").update(body).digest("hex");
    if (expected !== actual) {
      throw new Error(
        `Vendored registry.json does not match registry.json.sha256 (expected ${expected}, got ${actual})`
      );
    }
  }

  const setName = new Map(
    registry.sets.map((s) => [s.set_number, s.set_name])
  );

  const bySlug = {};
  const byLegacySlug = {};
  let legacyCollisions = 0;

  for (const p of registry.printings) {
    bySlug[p.slug] = p.printing_id;
    const legacy = toLegacySlug(p.slug, p.set_name || setName.get(p.set_number));
    if (legacy) {
      if (byLegacySlug[legacy] && byLegacySlug[legacy] !== p.printing_id) {
        legacyCollisions++;
        console.warn(
          `  collision: ${legacy} -> ${byLegacySlug[legacy]} and ${p.printing_id}`
        );
      }
      byLegacySlug[legacy] = p.printing_id;
    }
  }

  // Historical slugs resolve to the same printing, so an old decklist still maps
  for (const h of registry.slug_history || []) {
    if (!bySlug[h.slug]) bySlug[h.slug] = h.printing_id;
  }

  // printing -> card, so callers can find other printings of the same card
  const codexByPrinting = {};
  for (const p of registry.printings) codexByPrinting[p.printing_id] = p.codex_id;

  const assets = scanAssets();
  let artFallback = {};
  if (assets) {
    const built = buildArtFallbacks(registry, assets);
    artFallback = built.fallbacks;
    console.log(
      `Art fallbacks: ${Object.keys(artFallback).length} printings without local art` +
        (built.unresolved.length
          ? `, ${built.unresolved.length} with no fallback: ${built.unresolved.join(", ")}`
          : "")
    );
  } else {
    // Keep whatever was generated where the assets do live
    if (fs.existsSync(INDEX)) {
      artFallback = JSON.parse(fs.readFileSync(INDEX, "utf8")).artFallback || {};
    }
    console.warn(
      `data-webp/ not found - preserving ${Object.keys(artFallback).length} existing art fallbacks`
    );
  }

  const index = {
    generated: new Date().toISOString(),
    schemaVersion: registry.header.schema_version,
    registrySha256: crypto.createHash("sha256").update(body).digest("hex"),
    counts: {
      slugs: Object.keys(bySlug).length,
      legacySlugs: Object.keys(byLegacySlug).length,
      artFallbacks: Object.keys(artFallback).length,
    },
    bySlug,
    byLegacySlug,
    codexByPrinting,
    artFallback,
  };
  fs.writeFileSync(INDEX, `${JSON.stringify(index, null, 0)}\n`);
  fs.writeFileSync(ART_FALLBACK, `${JSON.stringify(artFallback, null, 2)}\n`);
  console.log(
    `Wrote printing-index.json: ${index.counts.slugs} slugs, ` +
      `${index.counts.legacySlugs} legacy slugs, ${legacyCollisions} collisions`
  );
}

(async () => {
  if (process.argv.includes("--download")) await download();
  buildIndex();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
