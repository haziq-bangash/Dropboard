/** Seeded random numbers for tests, so every run sees the same data. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Standard normal (Box-Muller). */
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  const int = (lo: number, hi: number) => Math.floor(lo + uniform() * (hi - lo + 1));
  return { uniform, normal, int };
}

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
