#!/usr/bin/env node
/**
 * Generates a compact search index for client-side card search.
 * Output: public/data/card-search-index.json
 */

const fs = require("fs");
const path = require("path");

const cardsPath = path.join(__dirname, "../data/cards_raw.json");
const outputPath = path.join(
  __dirname,
  "../public/data/card-search-index.json"
);

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8"));

// Build compact index: array of [cardName, cardId, variants[]]
// variants: [variantId, slug, setName, setId, finish]
const index = [];
let cardId = 1; // We'll need to match DB IDs - for now use sequential

// First pass: get all cards from DB to match IDs
// For now, generate a mapping file that can be used

const searchEntries = [];

for (const card of cards) {
  const cardName = card.name;

  for (const set of card.sets || []) {
    const setName = set.name;

    for (const variant of set.variants || []) {
      searchEntries.push({
        n: cardName, // name
        s: variant.slug, // slug
        t: setName, // set name
        f: variant.finish === "Foil" ? 1 : 0, // finish (1=foil, 0=standard)
      });
    }
  }
}

// Write compact JSON
const output = {
  v: 1, // version
  entries: searchEntries,
};

fs.writeFileSync(outputPath, JSON.stringify(output));

const stats = fs.statSync(outputPath);
console.log(
  `Generated search index: ${searchEntries.length} entries, ${(
    stats.size / 1024
  ).toFixed(1)}KB`
);
