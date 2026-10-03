import { describe, it, expect } from 'vitest';
import { shuffle } from '../shuffle';

describe('shuffle', () => {
  it('returns a permutation with the same elements', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];

    const result = shuffle(input, () => 0.42);

    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c', 'd'];
    const snapshot = [...input];

    shuffle(input, () => 0.5);

    expect(input).toEqual(snapshot);
  });

  it('is deterministic for a fixed random source (Fisher-Yates order)', () => {
    const input = [1, 2, 3, 4];

    expect(shuffle(input, () => 0)).toEqual([2, 3, 4, 1]);
    expect(shuffle(input, () => 0.5)).toEqual([1, 4, 2, 3]);
  });

  it('returns an empty array for empty input', () => {
    expect(shuffle([], () => 0)).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    expect(shuffle(['only'], () => 0)).toEqual(['only']);
  });

  it('throws for a random source outside [0, 1)', () => {
    expect(() => shuffle(['a', 'b'], () => 1)).toThrow(/\[0, 1\)/);
    expect(() => shuffle(['a', 'b'], () => -0.1)).toThrow(/\[0, 1\)/);
  });
});
