/*
  Generate the SQL that stamps registry ids onto Card/Variant.

  The backfill ships inside the Prisma migration rather than as a separate
  script so production picks it up through the normal `prisma migrate deploy`
  step in CI, with no manual follow-up on the droplet.

  Usage: node scripts/registry/generate-backfill-sql.js > backfill.sql
*/
const fs = require("fs");
const path = require("path");

const REGISTRY = path.join(
  __dirname, "..", "..", "data", "registry", "registry.json"
);
const INDEX = path.join(
  __dirname, "..", "..", "data", "registry", "printing-index.json"
);

const SAFE_SLUG = /^[a-z0-9_-]+$/;
const SAFE_ID = /^[CP][0-9]{6}$/;
const CHUNK = 500;

function chunk(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const codexByPrinting = index.codexByPrinting;

  const variantRows = [];
  const cardRows = [];
  for (const [legacySlug, printingId] of Object.entries(index.byLegacySlug)) {
    const codexId = codexByPrinting[printingId];
    if (!SAFE_SLUG.test(legacySlug)) {
      throw new Error(`Unsafe slug in registry index: ${legacySlug}`);
    }
    if (!SAFE_ID.test(printingId) || !SAFE_ID.test(codexId)) {
      throw new Error(`Unsafe id: ${printingId}/${codexId}`);
    }
    variantRows.push(`('${legacySlug}','${printingId}')`);
    cardRows.push(`('${legacySlug}','${codexId}')`);
  }

  const out = [];
  out.push(
    `-- Backfill generated from sorcery-registry schema v${registry.header.schema_version}`,
    `-- registry.json sha256: ${index.registrySha256}`,
    `-- ${variantRows.length} printings across ${registry.header.sets} sets`,
    `-- Regenerate with: node scripts/registry/generate-backfill-sql.js`,
    "",
    "-- Variants are matched on our legacy 3-letter slug (alp-detonate-b-s); the",
    "-- registry publishes the renumbered form (001-detonate-b-s) and only the",
    "-- leading set segment differs. Rows we have no registry entry for keep NULL.",
    ""
  );
  for (const part of chunk(variantRows, CHUNK)) {
    out.push(
      'UPDATE "Variant" v SET "printingId" = m.printing_id',
      `FROM (VALUES ${part.join(",")}) AS m(slug, printing_id)`,
      'WHERE v.slug = m.slug AND v."printingId" IS DISTINCT FROM m.printing_id;',
      ""
    );
  }

  out.push(
    "-- A card's codex id comes from any of its printings; all printings of one",
    "-- card agree, so which row wins does not matter.",
    ""
  );
  for (const part of chunk(cardRows, CHUNK)) {
    out.push(
      'UPDATE "Card" c SET "codexId" = m.codex_id',
      `FROM "Variant" v, (VALUES ${part.join(",")}) AS m(slug, codex_id)`,
      'WHERE v."cardId" = c.id AND v.slug = m.slug',
      '  AND c."codexId" IS DISTINCT FROM m.codex_id;',
      ""
    );
  }

  process.stdout.write(out.join("\n"));
}

main();
