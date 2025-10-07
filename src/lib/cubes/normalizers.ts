import { type CubeSummary } from "./types";

export type CubeSummaryInput = Record<string, unknown> & {
  cards?: unknown;
};

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    return rounded >= 0 ? rounded : 0;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const rounded = Math.floor(numeric);
      return rounded >= 0 ? rounded : 0;
    }
  }
  return null;
}

function extractCardCount(raw: CubeSummaryInput): number {
  const direct = toPositiveInteger(raw.cardCount ?? raw["cardCount"]);
  if (direct !== null) {
    return direct;
  }
  const cards = raw.cards ?? raw["cards"];
  if (!Array.isArray(cards)) {
    return 0;
  }
  return cards.reduce((sum, entry) => {
    if (!entry || typeof entry !== "object") return sum;
    const count = toPositiveInteger((entry as { count?: unknown }).count);
    return count !== null ? sum + count : sum;
  }, 0);
}

export function normalizeCubeSummary(
  input: CubeSummaryInput | null | undefined,
  overrides?: Partial<CubeSummary>,
): CubeSummary {
  const raw: CubeSummaryInput = input ?? {};
  const idValue = raw.id ?? raw["id"];
  const id = typeof idValue === "string" && idValue.trim().length > 0 ? idValue : String(idValue ?? "");

  const nameValue = raw.name ?? raw["name"];
  const name =
    typeof nameValue === "string" && nameValue.trim().length > 0
      ? nameValue.trim()
      : "Untitled Cube";

  const descriptionValue = raw.description ?? raw["description"];
  let description: string | null;
  if (typeof descriptionValue === "string") {
    description = descriptionValue;
  } else if (descriptionValue == null) {
    description = null;
  } else {
    description = String(descriptionValue);
  }

  const isPublic = Boolean(raw.isPublic ?? raw["isPublic"]);
  const imported = Boolean(raw.imported ?? raw["imported"]);

  const updatedAtValue = raw.updatedAt ?? raw["updatedAt"];
  let updatedAt: string;
  if (updatedAtValue instanceof Date) {
    updatedAt = updatedAtValue.toISOString();
  } else if (typeof updatedAtValue === "string" && updatedAtValue) {
    updatedAt = updatedAtValue;
  } else if (typeof updatedAtValue === "number" && Number.isFinite(updatedAtValue)) {
    updatedAt = new Date(updatedAtValue).toISOString();
  } else {
    updatedAt = new Date().toISOString();
  }

  const cardCount = extractCardCount(raw);

  const base: CubeSummary = {
    id,
    name,
    description,
    isPublic,
    imported,
    updatedAt,
    cardCount,
  };

  return { ...base, ...overrides };
}
