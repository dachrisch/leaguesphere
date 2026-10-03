/**
 * Fisher-Yates shuffle.
 *
 * Returns a new array; the input is left untouched. The random source is
 * injectable so callers (and tests) can make the order deterministic.
 */
export function shuffle<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const sample = random();
    if (sample < 0 || sample >= 1) {
      throw new RangeError(
        `shuffle random() must return a value in [0, 1); got ${sample}`,
      );
    }
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
