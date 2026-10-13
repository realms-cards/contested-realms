import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SINGLE_SQUARE_AURAS } from "./areaPrompt";

/**
 * The board promises, before you click, which sites an aura will cover. That promise is only
 * as good as our reading of the vendored scripts — and an aura's real footprint can be decided
 * twice: once by the `singleSiteAura` / `edgeAura` flags we can read, and again by a Genesis
 * that simply overwrites `aura.squares`.
 *
 * This re-derives the second group from the vendor tree every run, so the next `vendor-untested-
 * realm.sh` cannot quietly introduce an aura we would draw a four-site footprint for and then
 * drop onto one.
 */
const SCRIPTS = "vendor/untested-realm/shared/src/cards/scripts";
const CARD_DB = "vendor/untested-realm/shared/src/cards/cards.json";

function scriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? scriptFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("an aura's footprint as the vendored scripts actually define it", () => {
  const cards = JSON.parse(readFileSync(CARD_DB, "utf8")) as { name: string; type: string }[];
  const auraNames = new Set(cards.filter((c) => c.type === "Aura").map((c) => c.name));

  /** name -> what its script declares, for every aura the engine scripts. */
  const scripted = new Map<string, { flagged: boolean; setsOneSquare: boolean }>();
  for (const file of scriptFiles(SCRIPTS)) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/registerScript\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
      const name = match[2].replace(/\\'/g, "'");
      if (!auraNames.has(name)) continue;
      scripted.set(name, {
        flagged: /singleSiteAura:\s*true/.test(src) || /edgeAura:\s*true/.test(src),
        // `squares = [{ ... }]` is a rewrite to a literal square; Thunderstorm's
        // `squares = aura.squares.map(...)` only shifts the 2x2 it already has.
        setsOneSquare: /\.squares\s*=\s*\[\s*\{/.test(src),
      });
    }
  }

  it("has a script for every aura in the card database", () => {
    // if this fails the scan below has a blind spot and proves nothing
    expect([...auraNames].filter((name) => !scripted.has(name))).toEqual([]);
  });

  it("lists exactly the unflagged auras whose Genesis pins them to one square", () => {
    const found = [...scripted]
      .filter(([, shape]) => !shape.flagged && shape.setsOneSquare)
      .map(([name]) => name)
      .sort();
    expect(found).toEqual([...SINGLE_SQUARE_AURAS].sort());
  });

  it("never claims a footprint for an aura that declares its own shape", () => {
    for (const [name, shape] of scripted) {
      if (shape.flagged) expect(SINGLE_SQUARE_AURAS.has(name), `${name} is already flagged`).toBe(false);
    }
  });
});
