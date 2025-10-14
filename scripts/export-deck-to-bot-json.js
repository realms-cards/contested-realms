#!/usr/bin/env node
/*
Export a Deck (by name or id) to a simple JSON format usable by bots via CPU_BOT_DECK_FILE.

Usage:
  node scripts/export-deck-to-bot-json.js "Beta Precon – Earth" > data/bots/decks/precon-earth.json
  # or by id:
  node scripts/export-deck-to-bot-json.js id:<deckId> --out data/bots/decks/precon-earth.json

Output JSON shape:
{
  "spellbook": [ { "name": "Assorted Animals", "count": 2 }, ... ],
  "atlas": [ { "name": "Valley", "count": 12 }, ... ],
  "sideboard": [ { "name": "...", "count": 2 } ]
}
*/

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = { query: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!out.query) { out.query = a; continue; }
    if (a === '--out' && argv[i+1]) { out.out = argv[++i]; continue; }
  }
  return out;
}

async function main() {
  const { query, out } = parseArgs(process.argv);
  if (!query) {
    console.error('Usage: export-deck-to-bot-json.js <name|id:DECK_ID> [--out <file>]');
    process.exit(1);
  }
  const byId = query.startsWith('id:') ? query.slice(3) : null;
  let deck = null;
  if (byId) {
    deck = await prisma.deck.findUnique({
      where: { id: byId },
      include: { cards: { include: { card: true } } },
    });
  } else {
    deck = await prisma.deck.findFirst({
      where: { name: query },
      include: { cards: { include: { card: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }
  if (!deck) {
    console.error('Deck not found.');
    process.exit(1);
  }

  const spellbook = new Map();
  const atlas = new Map();
  const sideboard = new Map();
  for (const dc of deck.cards) {
    const name = dc.card?.name || 'Unknown';
    const count = Number(dc.count || 1);
    const zone = dc.zone || 'Spellbook';
    const map = zone === 'Atlas' ? atlas : zone === 'Sideboard' ? sideboard : spellbook;
    map.set(name, (map.get(name) || 0) + count);
  }
  const toArr = (m) => Array.from(m.entries()).map(([name, count]) => ({ name, count }));
  const payload = { spellbook: toArr(spellbook), atlas: toArr(atlas) };
  if (sideboard.size) payload.sideboard = toArr(sideboard);

  const json = JSON.stringify(payload, null, 2);
  if (out) {
    const abs = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, json);
    console.log(`Wrote ${abs}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
