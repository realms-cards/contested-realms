/*
  Compare Prisma DB contents against local snapshots:
  - data/cards_raw.json (all cards across sets)
  - reference/codex.csv (canonical codex; optional)

  Usage: npm run validate:cards
*/
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function readJson(p) {
  try {
    const s = fs.readFileSync(p, 'utf8');
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// Minimal CSV parser supporting quoted fields and commas within quotes
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* ignore; handle by \n */ }
      else { cur += ch; }
    }
  }
  // Push final field
  row.push(cur);
  rows.push(row);
  return rows;
}

function normalize(s) {
  return String(s || '').trim();
}

async function main() {
  const root = process.cwd();
  const snapshotPath = path.join(root, 'data', 'cards_raw.json');
  const codexPath = path.join(root, 'reference', 'codex.csv');

  // Load JSON snapshot
  const snapshot = readJson(snapshotPath);
  if (!Array.isArray(snapshot)) {
    console.error(`Could not read snapshot at ${snapshotPath}`);
  }

  // Build snapshot indexes
  const snapCardNames = new Set();
  const snapPairs = new Map(); // key: name|set -> rarity
  const snapSlugs = new Set();
  if (Array.isArray(snapshot)) {
    for (const card of snapshot) {
      const name = normalize(card && card.name);
      if (!name) continue;
      snapCardNames.add(name);
      const sets = Array.isArray(card.sets) ? card.sets : [];
      for (const s of sets) {
        const setName = normalize(s && s.name);
        const rarity = normalize(s && s.metadata && s.metadata.rarity);
        if (setName) snapPairs.set(`${name}|${setName}`, rarity);
        const variants = Array.isArray(s && s.variants) ? s.variants : [];
        for (const v of variants) {
          const slug = normalize(v && v.slug);
          if (slug) snapSlugs.add(slug);
        }
      }
    }
  }

  // Optional: load codex
  let codexPairs = new Map();
  let codexSlugs = new Set();
  if (fileExists(codexPath)) {
    try {
      const csv = fs.readFileSync(codexPath, 'utf8');
      const rows = parseCSV(csv).filter(r => r.length && r.some(x => x && String(x).trim() !== ''));
      const header = rows.shift() || [];
      const findCol = (name) => header.findIndex(h => String(h).toLowerCase().trim() === name);
      // Try common header names
      const nameIdx = [findCol('name'), findCol('card_name')].find(i => i >= 0);
      const setIdx = [findCol('set'), findCol('set_name')].find(i => i >= 0);
      const rarityIdx = [findCol('rarity')].find(i => i >= 0);
      const slugIdx = [findCol('slug'), findCol('variant_slug')].find(i => i >= 0);
      for (const r of rows) {
        const n = normalize(r[nameIdx]);
        const s = normalize(r[setIdx]);
        const rar = normalize(r[rarityIdx]);
        const slug = normalize(r[slugIdx]);
        if (n && s) codexPairs.set(`${n}|${s}`, rar);
        if (slug) codexSlugs.add(slug);
      }
    } catch (e) {
      console.warn(`Warning: failed to parse ${codexPath}: ${e.message}`);
    }
  }

  // Query DB
  const dbCards = await prisma.card.findMany({ select: { name: true } });
  const dbPairs = await prisma.cardSetMetadata.findMany({
    select: {
      rarity: true,
      card: { select: { name: true } },
      set: { select: { name: true } },
    },
  });
  const dbVariants = await prisma.variant.findMany({ select: { slug: true } });

  const dbCardNames = new Set(dbCards.map(c => normalize(c.name)));
  const dbPairMap = new Map(dbPairs.map(p => [
    `${normalize(p.card?.name)}|${normalize(p.set?.name)}`,
    normalize(p.rarity),
  ]));
  const dbSlugs = new Set(dbVariants.map(v => normalize(v.slug)));

  // Diff helpers
  function diffSets(a, b) {
    const missing = [];
    a.forEach(v => { if (!b.has(v)) missing.push(v); });
    return missing;
  }

  function diffMaps(a, b) {
    const mismatches = [];
    for (const [k, v] of a.entries()) {
      if (!b.has(k)) continue;
      const vb = b.get(k);
      if (v && vb && v !== vb) mismatches.push({ key: k, a: v, b: vb });
    }
    return mismatches;
  }

  // Compute diffs
  const missingCardsInDb = Array.isArray(snapshot) ? diffSets(snapCardNames, dbCardNames) : [];
  const extraCardsInDb = diffSets(dbCardNames, snapCardNames);
  const rarityMismatchesSnapVsDb = diffMaps(snapPairs, dbPairMap);
  const missingSlugsInDb = diffSets(snapSlugs, dbSlugs);
  const extraSlugsInDb = diffSets(dbSlugs, snapSlugs);

  const codexRarityVsDb = codexPairs.size ? diffMaps(codexPairs, dbPairMap) : [];
  const missingCodexSlugsInDb = codexSlugs.size ? diffSets(codexSlugs, dbSlugs) : [];

  // Print summary
  function sample(arr, n = 10) { return arr.slice(0, n); }
  console.log('=== Validation Summary ===');
  console.log(`Snapshot cards: ${snapCardNames.size || 0}, DB cards: ${dbCardNames.size}`);
  console.log(`Missing cards in DB: ${missingCardsInDb.length} ${missingCardsInDb.length ? '\n  ' + sample(missingCardsInDb).join('\n  ') : ''}`);
  console.log(`Extra cards in DB: ${extraCardsInDb.length} ${extraCardsInDb.length ? '\n  ' + sample(extraCardsInDb).join('\n  ') : ''}`);

  console.log(`\nSnapshot variants: ${snapSlugs.size || 0}, DB variants: ${dbSlugs.size}`);
  console.log(`Missing slugs in DB: ${missingSlugsInDb.length} ${missingSlugsInDb.length ? '\n  ' + sample(missingSlugsInDb).join('\n  ') : ''}`);
  console.log(`Extra slugs in DB: ${extraSlugsInDb.length} ${extraSlugsInDb.length ? '\n  ' + sample(extraSlugsInDb).join('\n  ') : ''}`);

  console.log(`\nRarity mismatches (Snapshot vs DB): ${rarityMismatchesSnapVsDb.length}`);
  for (const m of sample(rarityMismatchesSnapVsDb)) {
    console.log(`  ${m.key}: snapshot=${m.a} db=${m.b}`);
  }

  if (codexPairs.size) {
    console.log(`\nRarity mismatches (Codex vs DB): ${codexRarityVsDb.length}`);
    for (const m of sample(codexRarityVsDb)) {
      console.log(`  ${m.key}: codex=${m.a} db=${m.b}`);
    }
  }
  if (codexSlugs.size) {
    console.log(`Codex slugs missing in DB: ${missingCodexSlugsInDb.length} ${missingCodexSlugsInDb.length ? '\n  ' + sample(missingCodexSlugsInDb).join('\n  ') : ''}`);
  }
}

main().catch((e) => {
  console.error('Validation failed:', e && e.message ? e.message : e);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});

