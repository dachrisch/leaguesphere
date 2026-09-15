import { describe, it, expect, vi, afterEach } from 'vitest';
import { getProgressionFindingMessage } from '../progressionMessages';
import type { ProgressionFinding } from '../../types/progression';

describe('getProgressionFindingMessage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('translates via messageKey/messageParams when present', () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    const finding: ProgressionFinding = {
      id: 'f1',
      type: 'dangling_reference',
      message: 'raw fallback',
      messageKey: 'dangling_reference',
      messageParams: { game: 'G1' },
      affectedNodes: [],
    };

    const result = getProgressionFindingMessage(finding, t);

    expect(result).toBe('translated:validation:dangling_reference');
    expect(t).toHaveBeenCalledWith('validation:dangling_reference', { game: 'G1' });
  });

  it('falls back to the raw message and logs a warning when messageKey is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = vi.fn((key: string) => key);
    const finding: ProgressionFinding = {
      id: 'f2',
      type: 'undecided_tie',
      message: 'raw fallback text',
      affectedNodes: [],
    };

    const result = getProgressionFindingMessage(finding, t);

    expect(result).toBe('raw fallback text');
    expect(t).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
