#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "..", "data");
const cardsPath = path.join(dataDir, "cards_raw.json");
const outputPath = path.join(dataDir, "random-name-words.json");

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "into",
  "onto",
  "upon",
  "with",
  "without",
  "of",
  "off",
  "over",
  "under",
  "within",
  "between",
  "among",
  "against",
  "across",
  "about",
  "above",
  "below",
  "after",
  "before",
  "during",
  "while",
  "once",
  "ever",
  "even",
  "still",
  "just",
  "yet",
  "again",
  "each",
  "every",
  "any",
  "all",
  "some",
  "most",
  "more",
  "less",
  "many",
  "much",
  "few",
  "other",
  "others",
  "another",
  "own",
  "same",
  "such",
  "than",
  "then",
  "thus",
  "here",
  "there",
  "when",
  "what",
  "which",
  "where",
  "who",
  "whose",
  "whoever",
  "whatever",
  "whichever",
  "whenever",
  "wherever",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "it's",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
  "do",
  "does",
  "did",
  "done",
  "doing",
  "have",
  "has",
  "had",
  "having",
  "can",
  "could",
  "may",
  "might",
  "must",
  "shall",
  "should",
  "will",
  "would",
  "ought",
  "your",
  "yours",
  "their",
  "theirs",
  "them",
  "they",
  "we",
  "our",
  "ours",
  "you",
  "i",
  "me",
  "mine",
  "my",
  "myself"
]);

const GENERIC_SUBJECTS = new Set([
  "Card",
  "Cards",
  "Unit",
  "Units",
  "Spell",
  "Spells",
  "Avatar",
  "Avatars",
  "Site",
  "Sites",
  "Player",
  "Players",
  "Damage",
  "Deck",
  "Hand",
  "Life",
  "Mana",
  "Opponent",
  "Opponents",
  "Enemy",
  "Enemies",
  "Ally",
  "Allies",
  "Guardian",
  "Guardians",
  "Creature",
  "Creatures",
  "Permanent",
  "Permanents",
  "Relic",
  "Relics",
  "Artifact",
  "Artifacts",
  "Spirit",
  "Spirits",
  "Beast",
  "Beasts",
  "Mortal",
  "Mortals",
  "Element",
  "Elements",
  "Token",
  "Tokens",
  "Monster",
  "Monsters",
  "Champion",
  "Champions",
  "Hero",
  "Heroes"
]);

const MIN_PREDICATE_LENGTH = 4;
const MIN_ADJECTIVE_LENGTH = 5;
const MIN_SUBJECT_LENGTH = 3;
const OUTPUT_LIMIT = 256;

const toTitle = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

const normalizeWord = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z'-]/g, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z]/.test(cleaned)) return null;
  if (!/[A-Za-z]/.test(cleaned)) return null;
  return toTitle(cleaned);
};

const extractWords = (source) => {
  if (!source || typeof source !== "string") return [];
  return source
    .split(/[^A-Za-z'-]+/)
    .map(normalizeWord)
    .filter((word) => !!word);
};

const addPredicateWords = (card, sets) => {
  const name = typeof card.name === "string" ? card.name : "";
  const words = extractWords(name).filter((word) => {
    const lower = word.toLowerCase();
    return word.length >= MIN_PREDICATE_LENGTH && !STOPWORDS.has(lower);
  });
  words.forEach((word) => sets.predicates.add(word));
};

const addSubjectWords = (values, sets) => {
  for (const value of values) {
    if (!value) continue;
    const words = value
      .split(/[\s,\/]+/)
      .map(normalizeWord)
      .filter((word) => !!word)
      .filter((word) => word.length >= MIN_SUBJECT_LENGTH)
      .filter((word) => !GENERIC_SUBJECTS.has(word))
      .filter((word) => !STOPWORDS.has(word.toLowerCase()));
    words.forEach((word) => sets.subjects.add(word));
  }
};

const addAdjectiveWords = (texts, sets) => {
  for (const text of texts) {
    if (!text) continue;
    const words = extractWords(text).filter((word) => {
      const lower = word.toLowerCase();
      if (STOPWORDS.has(lower)) return false;
      if (word.length < MIN_ADJECTIVE_LENGTH) return false;
      return true;
    });
    words.forEach((word) => sets.adjectives.add(word));
  }
};

const clampSet = (input) =>
  Array.from(input)
    .filter((word) => word.length <= 18)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, OUTPUT_LIMIT);

const main = () => {
  const raw = readFileSync(cardsPath, "utf8");
  const cards = JSON.parse(raw);

  const sets = {
    predicates: new Set(),
    adjectives: new Set(),
    subjects: new Set(),
  };

  for (const card of cards) {
    addPredicateWords(card, sets);

    const guardian = card.guardian ?? null;
    const spell = card.spell ?? null;
    const site = card.site ?? null;

    addSubjectWords(
      [guardian?.type, guardian?.subTypes, spell?.type, site?.type],
      sets
    );

    const textSources = [guardian?.rulesText, spell?.rulesText, site?.rulesText];

    const setsArray = Array.isArray(card.sets) ? card.sets : [];
    for (const set of setsArray) {
      const meta = set?.metadata;
      if (meta?.rulesText && typeof meta.rulesText === "string") {
        textSources.push(meta.rulesText);
      }

      const variants = set?.variants;
      if (Array.isArray(variants)) {
        for (const variant of variants) {
          if (variant?.flavorText && typeof variant.flavorText === "string") {
            textSources.push(variant.flavorText);
          }
          if (variant?.typeText && typeof variant.typeText === "string") {
            addSubjectWords([variant.typeText], sets);
          }
        }
      }
    }

    addAdjectiveWords(textSources, sets);
  }

  const output = {
    predicates: clampSet(sets.predicates),
    adjectives: clampSet(sets.adjectives),
    subjects: clampSet(sets.subjects),
    metadata: {
      source: "cards_raw.json",
      generatedAt: new Date().toISOString(),
      counts: {
        predicates: sets.predicates.size,
        adjectives: sets.adjectives.size,
        subjects: sets.subjects.size,
      },
    },
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(
    `Wrote ${output.predicates.length} predicates, ${output.adjectives.length} adjectives, ${output.subjects.length} subjects to ${path.relative(
      process.cwd(),
      outputPath
    )}`
  );
};

main();
