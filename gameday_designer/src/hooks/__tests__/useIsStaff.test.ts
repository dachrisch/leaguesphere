import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { designerApi } from '../../api/designerApi';
import { useIsStaff } from '../useIsStaff';

describe('useIsStaff', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns true when config.is_staff is true', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({ mock_teams: false, is_staff: true });
    const { result } = renderHook(() => useIsStaff());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when config.is_staff is false', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({ mock_teams: false, is_staff: false });
    const { result } = renderHook(() => useIsStaff());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('defaults to false and does not throw when getConfig rejects', async () => {
    vi.spyOn(designerApi, 'getConfig').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIsStaff());

    // Let the rejected promise settle; the hook's .catch must handle it
    // without throwing/rejecting, and must leave isStaff at false.
    await waitFor(() => expect(designerApi.getConfig).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(false));
  });
});
