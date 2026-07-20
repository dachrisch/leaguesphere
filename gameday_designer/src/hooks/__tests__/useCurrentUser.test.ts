import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { designerApi } from '../../api/designerApi';
import { useCurrentUser } from '../useCurrentUser';

describe('useCurrentUser', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns username and avatarUrl from config when an avatar is set', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'jdoe',
      avatar_url: '/media/avatars/jdoe.png',
    });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current).toEqual({ username: 'jdoe', avatarUrl: '/media/avatars/jdoe.png' })
    );
  });

  it('returns a null avatarUrl when config has no avatar', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'jdoe',
      avatar_url: null,
    });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current).toEqual({ username: 'jdoe', avatarUrl: null })
    );
  });

  it('falls back to empty defaults when the request fails', async () => {
    vi.spyOn(designerApi, 'getConfig').mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current).toEqual({ username: '', avatarUrl: null })
    );
  });
});
