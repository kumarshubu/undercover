/**
 * Deterministic RNG. The seed is carried in GameState, so the same state plus
 * the same action always yields the same next state — which is what makes a
 * failing game replayable from its seed alone.
 *
 * mulberry32: small, fast, good enough for shuffling a party game.
 */

export interface Rng {
  seed: number;
  next(): number; // [0, 1)
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    get seed() {
      return s;
    },
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Uniform integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/**
 * Fisher-Yates. The bound is `i + 1`, not `i` — with `i` the shuffle is biased
 * and seat 0 is over-represented. Test D6 covers exactly this.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randInt(rng, items.length)];
}
