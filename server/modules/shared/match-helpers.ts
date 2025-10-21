export type MatchPermanent = Record<string, unknown>;

export type MatchPermanents = Record<string, MatchPermanent[]>;

export interface MatchConsoleEvent extends Record<string, unknown> {
  id?: number | string;
  ts?: number | string;
  text?: string;
}

export const MAX_CONSOLE_EVENTS = 200;

export function mergeEvents(
  prev: ReadonlyArray<MatchConsoleEvent> | undefined,
  additions: ReadonlyArray<MatchConsoleEvent> | undefined
): MatchConsoleEvent[] {
  const merged = new Map<string, MatchConsoleEvent>();

  if (Array.isArray(prev)) {
    for (const event of prev) {
      if (!event) continue;
      merged.set(stableEventKey(event), event);
    }
  }

  if (Array.isArray(additions)) {
    for (const event of additions) {
      if (!event) continue;
      merged.set(stableEventKey(event), event);
    }
  }

  const ordered = Array.from(merged.values()).sort((a, b) => {
    const tsA = normalizeNumericField(a.ts);
    const tsB = normalizeNumericField(b.ts);
    if (tsA !== tsB) return tsA - tsB;
    const idA = normalizeNumericField(a.id);
    const idB = normalizeNumericField(b.id);
    return idA - idB;
  });

  return ordered.length > MAX_CONSOLE_EVENTS
    ? ordered.slice(-MAX_CONSOLE_EVENTS)
    : ordered;
}

export function dedupePermanents(
  permanents: unknown
): MatchPermanents | null | undefined {
  try {
    if (!permanents || typeof permanents !== "object") {
      return permanents as MatchPermanents | null | undefined;
    }

    const input = permanents as Record<string, unknown>;
    const result: MatchPermanents = {};

    for (const [cell, entries] of Object.entries(input)) {
      const list = Array.isArray(entries) ? entries : [];
      const filtered: MatchPermanent[] = [];

      for (const item of list) {
        if (item && typeof item === "object") {
          filtered.push(item as MatchPermanent);
        }
      }

      result[cell] = filtered;
    }

    return result;
  } catch {
    return permanents as MatchPermanents | null | undefined;
  }
}

export function deepMergeReplaceArrays<T>(
  base: T,
  patch: unknown
): T {
  if (patch === undefined) {
    return base;
  }

  if (patch === null || typeof patch !== "object") {
    return patch as T;
  }

  if (Array.isArray(patch)) {
    return patch as unknown as T;
  }

  const source = patch as Record<string, unknown>;
  const target =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {};

  const output: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const current = output[key];
    output[key] = deepMergeReplaceArrays(current, value);
  }

  return output as T;
}

function normalizeNumericField(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stableEventKey(event: MatchConsoleEvent): string {
  return `${String(event.id ?? "")}|${String(event.ts ?? "")}|${String(
    event.text ?? ""
  )}`;
}
