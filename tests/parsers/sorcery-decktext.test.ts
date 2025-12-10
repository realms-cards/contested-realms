import { describe, it, expect } from "vitest";
import {
  parseSorceryDeckText,
  toZones,
} from "@/lib/decks/parsers/sorcery-decktext";

const SAMPLE = `Avatar (1)
1Druid
Aura (1)
1Atlantean Fate
5
Artifact (4)
1Aquamarine Core
1
2Mix Aqua
1
1Ring of Morrigan
1
Minion (31)
2Adept Illusionist
2
4Kettletop Leprechaun
2
3Autumn Unicorn
3
2Fey Changeling
3
3Lugbog Cat
3
3Tufted Turtles
3
1Captain Baldassare
4
3Pudge Butcher
4
1Ruler of Thul
4
2Selfsame Simulacrum
4
1Sir Ironside
4
1Questing Beast
5
1Mother Nature
6
1Seirawan Hydra
6
1The Green Knight
6
1Vatn Draconis
7
1Diluvian Kraken
8
Magic (14)
1Plague of Frogs
1
2Common Sense
2
1Dispel
2
2Pollimorph
2
1Bury
3
2Ice Lance
3
1Gigantism
4
2Shapeshift
4
2Snowball
5
Site (30)
3Aqueduct
2Autumn River
2Babbling Brook
2Bog
1Bottomless Pit
1Caerleon-Upon-Usk
2Floodplain
2Gnome Hollows
2Kelp Cavern
1Mirror Realm
2Pebbled Paths
1Pillar of Zeiros
3Pond
2Quagmire
2Rift Valley
2Valley of Delight
Deck History`;

describe("parseSorceryDeckText", () => {
  it("parses the sample deck text and totals per category", () => {
    const parsed = parseSorceryDeckText(SAMPLE);

    expect(parsed.totalByCategory.Avatar).toBe(1);
    expect(parsed.totalByCategory.Aura).toBe(1);
    expect(parsed.totalByCategory.Artifact).toBe(4);
    expect(parsed.totalByCategory.Minion).toBe(31);
    expect(parsed.totalByCategory.Magic).toBe(14);
    expect(parsed.totalByCategory.Site).toBe(30);

    expect(parsed.totalCards).toBe(1 + 1 + 4 + 31 + 14 + 30);

    // Should not produce parsing warnings for the provided input
    expect(parsed.issues.filter((i) => i.type === "warning")).toHaveLength(0);

    // Spot-check some entries
    const minions = parsed.categories.Minion;
    const hydra = minions.find((c) => c.name === "Seirawan Hydra");
    expect(hydra?.count).toBe(1);

    const sites = parsed.categories.Site;
    const aqueduct = sites.find((c) => c.name === "Aqueduct");
    expect(aqueduct?.count).toBe(3);
  });

  it("converts to zones (Spellbook/Atlas)", () => {
    const parsed = parseSorceryDeckText(SAMPLE);
    const zones = toZones(parsed);

    const aqueduct = zones.find((z) => z.name === "Aqueduct");
    expect(aqueduct?.zone).toBe("Atlas");
    expect(aqueduct?.count).toBe(3);

    const druid = zones.find((z) => z.name === "Druid");
    expect(druid?.zone).toBe("Spellbook");
    expect(druid?.count).toBe(1);
  });

  it("handles cards starting with numbers like '13 Treasures of Britain'", () => {
    const input = `Artifact (1)
1 13 Treasures of Britain`;

    const parsed = parseSorceryDeckText(input);

    expect(parsed.totalByCategory.Artifact).toBe(1);
    const artifacts = parsed.categories.Artifact;
    const treasures = artifacts.find(
      (c) => c.name === "13 Treasures of Britain"
    );
    expect(treasures).toBeDefined();
    expect(treasures?.count).toBe(1);
  });

  it("handles CardNexus format with set names in parentheses", () => {
    const input = `Site (4)
1 Valley (PROMOTIONAL)
1 Rift Valley (BETA)
1 Valley of Delight (ARTHURIAN-LEGENDS)
1 Necromancer (GOTHIC)`;

    const parsed = parseSorceryDeckText(input);

    expect(parsed.totalByCategory.Site).toBe(4);
    const sites = parsed.categories.Site;

    // Check that names are extracted without set suffix
    const valley = sites.find((c) => c.name === "Valley");
    expect(valley).toBeDefined();
    expect(valley?.count).toBe(1);
    expect(valley?.set).toBe("Promotional");

    const riftValley = sites.find((c) => c.name === "Rift Valley");
    expect(riftValley).toBeDefined();
    expect(riftValley?.set).toBe("Beta");

    const valleyOfDelight = sites.find((c) => c.name === "Valley of Delight");
    expect(valleyOfDelight).toBeDefined();
    expect(valleyOfDelight?.set).toBe("Arthurian Legends");

    const necromancer = sites.find((c) => c.name === "Necromancer");
    expect(necromancer).toBeDefined();
    expect(necromancer?.set).toBe("Gothic");
  });

  it("handles mixed formats in the same deck", () => {
    const input = `Avatar (1)
1Druid
Artifact (2)
1 13 Treasures of Britain
1 Ring of Morrigan (BETA)
Site (2)
2Valley
1 Rift Valley (ARTHURIAN-LEGENDS)`;

    const parsed = parseSorceryDeckText(input);

    expect(parsed.totalByCategory.Avatar).toBe(1);
    expect(parsed.totalByCategory.Artifact).toBe(2);
    expect(parsed.totalByCategory.Site).toBe(3);

    // Check "13 Treasures of Britain" is parsed correctly
    const treasures = parsed.categories.Artifact.find(
      (c) => c.name === "13 Treasures of Britain"
    );
    expect(treasures?.count).toBe(1);

    // Check Ring of Morrigan with set
    const ring = parsed.categories.Artifact.find(
      (c) => c.name === "Ring of Morrigan"
    );
    expect(ring?.count).toBe(1);
    expect(ring?.set).toBe("Beta");

    // Check Valley without set (no-separator format)
    const valley = parsed.categories.Site.find((c) => c.name === "Valley");
    expect(valley?.count).toBe(2);
    expect(valley?.set).toBeUndefined();

    // Check Rift Valley with set
    const riftValley = parsed.categories.Site.find(
      (c) => c.name === "Rift Valley"
    );
    expect(riftValley?.count).toBe(1);
    expect(riftValley?.set).toBe("Arthurian Legends");
  });

  it("does not confuse card names with parentheses that are not set names", () => {
    // Card names with lowercase parentheses should not be treated as set names
    const input = `Magic (1)
1 Some Card (with notes)`;

    const parsed = parseSorceryDeckText(input);

    // "(with notes)" is lowercase, so it should NOT be stripped as a set name
    const card = parsed.categories.Magic.find((c) =>
      c.name.includes("Some Card")
    );
    expect(card).toBeDefined();
    expect(card?.name).toBe("Some Card (with notes)");
    expect(card?.set).toBeUndefined();
  });
});
