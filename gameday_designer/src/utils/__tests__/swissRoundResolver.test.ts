/**
 * Tests for the Swiss-system round resolver (issue #1970, JLT Flag 2026 rules).
 * Mirrors `gameday_designer/tests/test_swiss_round_resolver.py` — keep in sync.
 */

import { describe, it, expect } from 'vitest';
import { resolveSwissRound, SWISS_BYE_POINTS } from '../swissRoundResolver';

function pairKey(home: string, away: string): string {
  return [home, away].sort().join('|');
}

describe('resolveSwissRound', () => {
  it('pairs top half vs bottom half by seed in round one', () => {
    const result = resolveSwissRound(['T1', 'T2', 'T3', 'T4'], {});
    expect(result.pairings).toEqual([['T1', 'T3'], ['T2', 'T4']]);
    expect(result.bye).toBeNull();
    expect(result.floaters).toEqual([]);
  });

  it('groups by points', () => {
    const result = resolveSwissRound(['T1', 'T2', 'T3', 'T4'], { T1: 2, T2: 2, T3: 0, T4: 0 });
    expect(result.pairings).toEqual([['T1', 'T2'], ['T3', 'T4']]);
    expect(result.bye).toBeNull();
  });

  it('floats the lowest seed of an odd group down and byes the lowest-ranked team', () => {
    const result = resolveSwissRound(
      ['T1', 'T2', 'T3', 'T4', 'T5'],
      { T1: 2, T2: 2, T3: 2, T4: 0, T5: 0 },
    );
    expect(result.floaters).toEqual(['T3']);
    expect(result.bye).toBe('T5');
    expect(result.pairings).toEqual([['T1', 'T2'], ['T3', 'T4']]);
  });

  it('gives the bye to the lowest-ranked team without one', () => {
    const result = resolveSwissRound(
      ['T1', 'T2', 'T3'],
      { T1: 4, T2: 2, T3: 0 },
      new Set(['T3']),
    );
    expect(result.bye).toBe('T2');
    expect(result.pairings).toEqual([['T1', 'T3']]);
  });

  it('values a bye at two points', () => {
    expect(SWISS_BYE_POINTS).toBe(2);
  });

  it('avoids rematches with an adjacent swap', () => {
    const result = resolveSwissRound(
      ['T1', 'T2', 'T3', 'T4'],
      {},
      new Set(),
      new Set([pairKey('T1', 'T3')]),
    );
    expect(result.pairings.map(([h, a]) => pairKey(h, a))).not.toContain(pairKey('T1', 'T3'));
    expect(result.pairings.map(([h, a]) => pairKey(h, a)).sort()).toEqual(
      [pairKey('T1', 'T4'), pairKey('T2', 'T3')].sort(),
    );
  });

  it('pairs or byes every team exactly once', () => {
    const result = resolveSwissRound(
      ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      { T1: 4, T2: 4, T3: 2, T4: 2, T5: 2, T6: 0, T7: 0 },
    );
    const seen = [...result.pairings.flat(), ...(result.bye ? [result.bye] : [])];
    expect(seen.sort()).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  });

  it('repairs rematches the adjacent swap cannot fix', () => {
    // Round 4 of the approved 6-team run-through: the adjacent pass leaves
    // 1v2 and 5v6 standing (every single swap trades one rematch for
    // another). The global repair must find the rematch-free round.
    const previous = new Set(
      [
        ['T1', 'T4'],
        ['T2', 'T5'],
        ['T3', 'T6'],
        ['T1', 'T2'],
        ['T3', 'T5'],
        ['T4', 'T6'],
        ['T1', 'T3'],
        ['T2', 'T4'],
        ['T5', 'T6'],
      ].map(([h, a]) => pairKey(h, a)),
    );
    const result = resolveSwissRound(
      ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
      { T1: 6, T2: 4, T3: 4, T4: 2, T5: 2, T6: 0 },
      new Set(),
      previous,
    );
    const paired = result.pairings.map(([h, a]) => pairKey(h, a));
    expect(paired.some((key) => previous.has(key))).toBe(false);
    expect(paired.sort()).toEqual(
      [pairKey('T1', 'T6'), pairKey('T2', 'T3'), pairKey('T4', 'T5')].sort(),
    );
  });
});
