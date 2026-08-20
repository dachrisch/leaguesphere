import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import toLocalTime from '../time';

beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/Berlin');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('toLocalTime', () => {
  it('renders a UTC ISO timestamp in the local time zone', () => {
    expect(toLocalTime('2026-08-15T08:05:00+00:00')).toBe('10:05');
  });

  it('passes through non-ISO values (already local wall-clock times)', () => {
    expect(toLocalTime('10:00')).toBe('10:00');
  });

  it('returns an empty string for empty input', () => {
    expect(toLocalTime(null)).toBe('');
    expect(toLocalTime('')).toBe('');
  });
});