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

type CardCounts = { main: number; sideboard: number };

function extractCardCounts(raw: CubeSummaryInput): CardCounts {
  // Check for direct counts first
  const directMain = toPositiveInteger(raw.cardCount ?? raw["cardCount"]);
  const directSideboard = toPositiveInteger(raw.sideboardCount ?? raw["sideboardCount"]);
  if (directMain !== null && directSideboard !== null) {
    return { main: directMain, sideboard: directSideboard };
  }

  const cards = raw.cards ?? raw["cards"];
  if (!Array.isArray(cards)) {
    return { main: directMain ?? 0, sideboard: directSideboard ?? 0 };
  }

  let mainCount = 0;
  let sideboardCount = 0;
  for (const entry of cards) {
    if (!entry || typeof entry !== "object") continue;
    const entryObj = entry as { count?: unknown; zone?: unknown };
    const count = toPositiveInteger(entryObj.count);
    if (count === null || count === 0) continue;
    const zone = typeof entryObj.zone === "string" ? entryObj.zone.toLowerCase() : "main";
    if (zone === "sideboard") {
      sideboardCount += count;
    } else {
      mainCount += count;
    }
  }

  return { main: mainCount, sideboard: sideboardCount };
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

  const counts = extractCardCounts(raw);

  const base: CubeSummary = {
    id,
    name,
    description,
    isPublic,
    imported,
    updatedAt,
    cardCount: counts.main,
    sideboardCount: counts.sideboard,
  };

  return { ...base, ...overrides };
}
