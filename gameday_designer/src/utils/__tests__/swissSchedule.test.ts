import { describe, it, expect } from 'vitest';
import { computeSwissRoundTimes, toMinutes, toTime } from '../swissSchedule';

describe('swissSchedule', () => {
  it('converts between HH:MM and minutes', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('10:20')).toBe(620);
    expect(toTime(540)).toBe('09:00');
    expect(toTime(620)).toBe('10:20');
  });

  it('spaces rounds by slots-per-field times game plus break', () => {
    // 6 teams -> 3 games/round, 2 fields -> 2 slots/field,
    // 2 * (30 + 10) = 80 min rounds from 09:00.
    expect(computeSwissRoundTimes(6, 4, 2, 30, '09:00')).toEqual([
      '09:00',
      '10:20',
      '11:40',
      '13:00',
    ]);
  });

  it('packs single-field rounds back to back', () => {
    // 4 teams -> 2 games, 1 field -> 2 slots * 40 = 80 min.
    expect(computeSwissRoundTimes(4, 2, 1, 30, '09:00')).toEqual(['09:00', '10:20']);
  });

  it('rounds odd team counts up to a full slot', () => {
    // 5 teams -> ceil(5/2) = 3 games, 2 fields -> 2 slots * 40 = 80 min.
    expect(computeSwissRoundTimes(5, 2, 2, 30, '09:00')).toEqual(['09:00', '10:20']);
  });
});
