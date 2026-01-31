#!/usr/bin/env node
/**
 * Export card winrate data from production /api/meta/cards endpoint.
 * Outputs: data/bots/card-winrates.json
 *
 * Usage:
 *   node scripts/export-card-winrates.js
 *   node scripts/export-card-winrates.js --url https://your-production-url.com
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_URL = "http://localhost:3000";
const FORMATS = ["constructed", "sealed", "draft"];
const LIMIT = 200;

async function fetchFormat(baseUrl, format) {
  const url = `${baseUrl}/api/meta/cards?format=${format}&limit=${LIMIT}&order=plays`;
  console.log(`[WinrateExport] Fetching ${format} from ${url}...`);

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(
      `[WinrateExport] Failed to fetch ${format}: ${res.status} ${res.statusText}`
    );
    return [];
  }

  const data = await res.json();
  return data.stats || [];
}

async function main() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf("--url");
  const baseUrl =
    urlIdx !== -1 && args[urlIdx + 1] ? args[urlIdx + 1] : DEFAULT_URL;

  console.log(`[WinrateExport] Using base URL: ${baseUrl}`);

  const allCards = new Map();

  for (const format of FORMATS) {
    const stats = await fetchFormat(baseUrl, format);

    for (const card of stats) {
      const name = card.name;
      if (!name || name === "0") continue;

      const existing = allCards.get(name);
      if (existing) {
        // Merge: add plays/wins/losses across formats
        existing.totalPlays += card.plays || 0;
        existing.totalWins += card.wins || 0;
        existing.totalLosses += card.losses || 0;
        existing.totalDraws += card.draws || 0;
        existing.formats[format] = {
          plays: card.plays || 0,
          wins: card.wins || 0,
          losses: card.losses || 0,
          draws: card.draws || 0,
          winRate: card.winRate || 0,
        };
      } else {
        allCards.set(name, {
          cardId: card.cardId,
          name,
          type: card.type || null,
          slug: card.slug || null,
          totalPlays: card.plays || 0,
          totalWins: card.wins || 0,
          totalLosses: card.losses || 0,
          totalDraws: card.draws || 0,
          formats: {
            [format]: {
              plays: card.plays || 0,
              wins: card.wins || 0,
              losses: card.losses || 0,
              draws: card.draws || 0,
              winRate: card.winRate || 0,
            },
          },
        });
      }
    }

    console.log(`[WinrateExport] ${format}: ${stats.length} cards`);
  }

  // Calculate aggregate winrate
  const cards = {};
  for (const [name, data] of allCards) {
    const denom = data.totalWins + data.totalLosses;
    const winRate = denom > 0 ? data.totalWins / denom : 0;

    cards[name] = {
      cardId: data.cardId,
      type: data.type,
      slug: data.slug,
      totalPlays: data.totalPlays,
      totalWins: data.totalWins,
      totalLosses: data.totalLosses,
      totalDraws: data.totalDraws,
      winRate: Math.round(winRate * 1000) / 1000,
      formats: data.formats,
    };
  }

  const output = {
    generated: new Date().toISOString(),
    source: `${baseUrl}/api/meta/cards`,
    cardCount: Object.keys(cards).length,
    cards,
  };

  const outPath = path.join(
    __dirname,
    "..",
    "data",
    "bots",
    "card-winrates.json"
  );
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(
    `[WinrateExport] Wrote ${Object.keys(cards).length} cards to ${outPath}`
  );

  // Print top 10 by winrate (minimum 5 plays)
  const sorted = Object.entries(cards)
    .filter(([, d]) => d.totalPlays >= 5)
    .sort(([, a], [, b]) => b.winRate - a.winRate);

  console.log("\n--- Top 10 by Winrate (min 5 plays) ---");
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const [name, d] = sorted[i];
    console.log(
      `  ${i + 1}. ${name}: ${(d.winRate * 100).toFixed(1)}% (${d.totalPlays} plays)`
    );
  }
}

main().catch((err) => {
  console.error("[WinrateExport] Fatal error:", err.message);
  process.exit(1);
});
