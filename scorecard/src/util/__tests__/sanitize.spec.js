import { describe, it, expect } from 'vitest';
import { digitsOnly } from '../sanitize';

describe('digitsOnly', () => {
  it('keeps a plain integer string', () => {
    expect(digitsOnly('22')).toBe('22');
  });
  it('strips a decimal point so no float can be entered (#1465)', () => {
    expect(digitsOnly('51.85')).toBe('5185');
  });
  it('strips letters and symbols', () => {
    expect(digitsOnly('1a-2')).toBe('12');
  });
  it('returns empty string for null/undefined', () => {
    expect(digitsOnly(undefined)).toBe('');
    expect(digitsOnly(null)).toBe('');
  });
});
