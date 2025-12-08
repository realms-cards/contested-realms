#!/usr/bin/env node
/**
 * Export Gothic set cards to Excel
 * Usage: node scripts/export-gothic-excel.js
 */

const fs = require("fs");
const path = require("path");

// Check if xlsx is installed
let XLSX;
try {
  XLSX = require("xlsx");
} catch {
  console.error("xlsx package not found. Installing...");
  const { execSync } = require("child_process");
  execSync("npm install xlsx", { stdio: "inherit" });
  XLSX = require("xlsx");
}

const cardsPath = path.join(__dirname, "..", "data", "cards_raw.json");
const outputPath = path.join(__dirname, "..", "exports", "gothic-set.xlsx");

// Ensure exports directory exists
const exportsDir = path.dirname(outputPath);
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Load cards
const cards = JSON.parse(fs.readFileSync(cardsPath, "utf-8"));

// Filter cards that have a Gothic set entry
const gothicCards = [];

for (const card of cards) {
  const gothicSet = card.sets?.find((s) => s.name === "Gothic");
  if (gothicSet) {
    const meta = gothicSet.metadata || card.guardian || {};
    const thresholds = meta.thresholds || {};

    // Get variants for this set
    const variants = gothicSet.variants || [];
    const standardVariant =
      variants.find((v) => v.finish === "Standard") || variants[0] || {};

    gothicCards.push({
      Name: card.name,
      Type: meta.type || "",
      Rarity: meta.rarity || "",
      Elements: card.elements || "",
      SubTypes: card.subTypes || "",
      Cost: meta.cost ?? "",
      Attack: meta.attack ?? "",
      Defence: meta.defence ?? "",
      Life: meta.life ?? "",
      Air: thresholds.air || 0,
      Earth: thresholds.earth || 0,
      Fire: thresholds.fire || 0,
      Water: thresholds.water || 0,
      "Rules Text": (meta.rulesText || "").replace(/\n/g, " | "),
      Artist: standardVariant.artist || "",
      "Flavor Text": standardVariant.flavorText || "",
      "Type Text": standardVariant.typeText || "",
      Slug: standardVariant.slug || "",
    });
  }
}

// Sort by type, then rarity, then name
const typeOrder = ["Avatar", "Site", "Minion", "Magic", "Artifact", "Aura"];
const rarityOrder = ["Ordinary", "Exceptional", "Elite", "Unique"];

gothicCards.sort((a, b) => {
  const typeA = typeOrder.indexOf(a.Type);
  const typeB = typeOrder.indexOf(b.Type);
  if (typeA !== typeB) return typeA - typeB;

  const rarityA = rarityOrder.indexOf(a.Rarity);
  const rarityB = rarityOrder.indexOf(b.Rarity);
  if (rarityA !== rarityB) return rarityA - rarityB;

  return a.Name.localeCompare(b.Name);
});

console.log(`Found ${gothicCards.length} Gothic set cards`);

// Create workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(gothicCards);

// Set column widths
ws["!cols"] = [
  { wch: 25 }, // Name
  { wch: 10 }, // Type
  { wch: 12 }, // Rarity
  { wch: 15 }, // Elements
  { wch: 20 }, // SubTypes
  { wch: 6 }, // Cost
  { wch: 7 }, // Attack
  { wch: 8 }, // Defence
  { wch: 6 }, // Life
  { wch: 5 }, // Air
  { wch: 6 }, // Earth
  { wch: 5 }, // Fire
  { wch: 6 }, // Water
  { wch: 60 }, // Rules Text
  { wch: 20 }, // Artist
  { wch: 40 }, // Flavor Text
  { wch: 30 }, // Type Text
  { wch: 30 }, // Slug
];

XLSX.utils.book_append_sheet(wb, ws, "Gothic Cards");

// Write file
XLSX.writeFile(wb, outputPath);

console.log(`Exported to: ${outputPath}`);
