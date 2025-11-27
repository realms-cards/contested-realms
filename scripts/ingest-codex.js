#!/usr/bin/env node
/**
 * Ingest codex CSV into the database
 * Parses the codex file and creates CodexEntry records
 * Also extracts card name references [[Card Name]] for linking
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Simple CSV parser that handles quoted multi-line fields
function parseCSV(content) {
  const rows = [];
  let current = { title: "", content: "", subcodexes: "" };
  let value = "";
  let inQuotes = false;
  const fields = ["title", "content", "subcodexes"];
  let fieldIndex = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        value += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      current[fields[fieldIndex]] = value.trim();
      value = "";
      fieldIndex++;
      if (fieldIndex >= fields.length) fieldIndex = fields.length - 1;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      // End of row
      if (char === "\r" && next === "\n") i++; // Skip \r\n
      current[fields[fieldIndex]] = value.trim();
      if (current.title || current.content || current.subcodexes) {
        rows.push({ ...current });
      }
      current = { title: "", content: "", subcodexes: "" };
      value = "";
      fieldIndex = 0;
    } else {
      value += char;
    }
  }

  // Don't forget the last row
  current[fields[fieldIndex]] = value.trim();
  if (current.title || current.content || current.subcodexes) {
    rows.push({ ...current });
  }

  return rows;
}

// Extract [[Card Name]] references from content
function extractCardRefs(content) {
  const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

async function main() {
  // Find codex file - check for dated files first
  let codexPath = process.argv.find((a) => a.endsWith(".csv"));

  if (!codexPath) {
    const refDir = path.join(__dirname, "../reference");
    const files = fs
      .readdirSync(refDir)
      .filter((f) => f.startsWith("codex-") && f.endsWith(".csv"));
    if (files.length > 0) {
      // Sort to get most recent
      files.sort().reverse();
      codexPath = path.join(refDir, files[0]);
    } else {
      codexPath = path.join(refDir, "codex.csv");
    }
  }

  if (!fs.existsSync(codexPath)) {
    console.error(`Codex file not found: ${codexPath}`);
    process.exit(1);
  }

  console.log(`Reading codex from: ${codexPath}`);
  const csvContent = fs.readFileSync(codexPath, "utf-8");

  // Parse CSV (skip header row)
  const allRows = parseCSV(csvContent);
  const records = allRows.slice(1); // Skip header

  console.log(`Parsed ${records.length} records`);

  // Filter to entries with a title (skip continuation rows)
  const entries = records.filter((r) => r.title && r.title.trim());
  console.log(`Found ${entries.length} titled entries`);

  // Build entry map merging subcodexes
  const entryMap = new Map();

  for (const record of records) {
    const title = (record.title || "").trim();
    const content = (record.content || "").trim();
    const subcodex = (record.subcodexes || "").trim();

    if (title) {
      // New entry
      entryMap.set(title, {
        title,
        content,
        subcodexes: subcodex ? [subcodex] : [],
        cardRefs: extractCardRefs(content + " " + subcodex),
      });
    } else if (subcodex) {
      // Continuation - append to last entry
      const lastEntry = [...entryMap.values()].pop();
      if (lastEntry) {
        lastEntry.subcodexes.push(subcodex);
        lastEntry.cardRefs.push(...extractCardRefs(subcodex));
        lastEntry.cardRefs = [...new Set(lastEntry.cardRefs)];
      }
    }
  }

  console.log(`Merged into ${entryMap.size} unique entries`);

  // Preview mode - just show what we'd insert
  if (process.argv.includes("--preview")) {
    console.log("\n--- Preview (first 10 entries) ---");
    let i = 0;
    for (const entry of entryMap.values()) {
      if (i++ >= 10) break;
      console.log(`\nTitle: ${entry.title}`);
      console.log(`Content: ${entry.content.slice(0, 100)}...`);
      console.log(`Subcodexes: ${entry.subcodexes.length}`);
      console.log(
        `Card refs: ${entry.cardRefs.slice(0, 5).join(", ")}${
          entry.cardRefs.length > 5 ? "..." : ""
        }`
      );
    }
    return;
  }

  // Upsert entries into database
  console.log("\nUpserting to database...");
  let created = 0;
  let updated = 0;

  for (const entry of entryMap.values()) {
    const fullContent =
      entry.content +
      (entry.subcodexes.length ? "\n\n" + entry.subcodexes.join("\n\n") : "");

    try {
      const result = await prisma.codexEntry.upsert({
        where: { title: entry.title },
        create: {
          title: entry.title,
          content: fullContent,
          cardRefs: entry.cardRefs,
        },
        update: {
          content: fullContent,
          cardRefs: entry.cardRefs,
        },
      });
      if (result) {
        // Check if it was created or updated based on timestamps
        updated++;
      }
    } catch (e) {
      console.error(`Error upserting "${entry.title}":`, e.message);
    }
  }

  console.log(`Done! Processed ${entryMap.size} entries`);

  // Show stats
  const total = await prisma.codexEntry.count();
  console.log(`Total codex entries in database: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
