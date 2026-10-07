import { describe, it, expect } from 'vitest';
import { buildSwissAdjustTeamOptions } from '../SwissRoundAdjustModal';

describe('buildSwissAdjustTeamOptions', () => {
  it('joins seed ids to pool labels with realistic team-* ids', () => {
    const options = buildSwissAdjustTeamOptions(
      [7, 42],
      [
        { id: 'team-7', label: 'Lions' },
        { id: 'team-42', label: 'Tigers' },
      ],
    );

    expect(options).toEqual([
      { id: 7, name: 'Lions' },
      { id: 42, name: 'Tigers' },
    ]);
  });

  it('resolves numeric-string pool ids', () => {
    const options = buildSwissAdjustTeamOptions([7], [{ id: '7', label: 'Lions' }]);

    expect(options).toEqual([{ id: 7, name: 'Lions' }]);
  });

  it('excludes uuid-suffixed pool teams and drops pool teams outside seedOrder', () => {
    const options = buildSwissAdjustTeamOptions(
      [7],
      [
        { id: 'team-7', label: 'Lions' },
        { id: 'team-550e8400-e29b-41d4-a716-446655440000', label: 'Ghosts' },
        { id: 'team-99', label: 'Outsiders' },
      ],
    );

    expect(options).toEqual([{ id: 7, name: 'Lions' }]);
  });

  it('falls back to Team {id} for seed ids missing from the pool', () => {
    const options = buildSwissAdjustTeamOptions([7, 8], [{ id: 'team-7', label: 'Lions' }]);

    expect(options).toEqual([
      { id: 7, name: 'Lions' },
      { id: 8, name: 'Team 8' },
    ]);
  });
});
