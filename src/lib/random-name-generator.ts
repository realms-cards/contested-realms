import wordData from "../../data/random-name-words.json";

type RandomNameWordBuckets = {
  predicates: string[];
  adjectives: string[];
  subjects: string[];
  metadata?: {
    source?: string;
    generatedAt?: string;
    counts?: {
      predicates?: number;
      adjectives?: number;
      subjects?: number;
    };
  };
};

const FALLBACK_WORDS = {
  predicates: ["Gathering", "Contest", "Conclave"],
  adjectives: ["Arcane", "Ancient", "Mystic"],
  subjects: ["Sorcerers", "Legends", "Realms"],
};

const buckets = (wordData as RandomNameWordBuckets) ?? FALLBACK_WORDS;

const pick = (words: string[] | undefined, fallback: string[]) => {
  const list = words && words.length ? words : fallback;
  return list[Math.floor(Math.random() * list.length)] ?? fallback[0];
};

export type RandomNameFormat = "of" | "space";

export function generateRandomName(format: RandomNameFormat = "of"): string {
  const predicate = pick(buckets.predicates, FALLBACK_WORDS.predicates);
  const adjective = pick(buckets.adjectives, FALLBACK_WORDS.adjectives);
  const subject = pick(buckets.subjects, FALLBACK_WORDS.subjects);

  if (format === "space") {
    return `${predicate} ${adjective} ${subject}`;
  }
  return `${predicate} of ${adjective} ${subject}`;
}

export const generateLobbyName = () => generateRandomName("of");

export const generateTournamentName = () => generateRandomName("space");
