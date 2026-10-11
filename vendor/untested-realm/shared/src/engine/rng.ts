/** Deterministic RNG (mulberry32) — the seed lives in GameState so shuffles replay. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Shuffle in place using the state's seed; advances and returns the new seed. */
export function shuffleWithSeed<T>(arr: T[], seed: number): number {
  const rnd = mulberry32(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  // derive a fresh seed so consecutive shuffles differ
  return Math.floor(rnd() * 0xffffffff)
}
