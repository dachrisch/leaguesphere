/**
 * useDesignerController saveData error propagation (#1972).
 *
 * saveData must REJECT when the backend save fails so callers can react:
 * the debounced autosave (try/catch + queued .catch), the beforeunload
 * flush (.catch), handleGenerateSwiss (try/catch) and handleClearAll
 * (try/catch). Swallowing the error silently would leave the
 * abort-on-save-failure paths unreachable. This is the regression guard
 * for the audited rethrow in useDesignerController.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDesignerController } from '../useDesignerController';
import { useFlowState } from '../useFlowState';
import { gamedayApi } from '../../api/gamedayApi';
import type { FlowState } from '../../types/flowchart';

vi.mock('../../api/gamedayApi', () => ({
  gamedayApi: {
    getDesignerState: vi.fn(),
    updateDesignerState: vi.fn(),
  },
}));

const STATE = {
  nodes: [],
  edges: [],
  globalTeams: [],
  globalTeamGroups: [],
} as unknown as FlowState;

function renderController(gamedayId: string | undefined) {
  return renderHook(() => {
    const flowState = useFlowState();
    return { flowState, controller: useDesignerController(gamedayId, flowState) };
  });
}

describe('useDesignerController saveData failures', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects (propagates) when the backend save fails', async () => {
    vi.mocked(gamedayApi.updateDesignerState).mockRejectedValueOnce(
      new Error('save failed'),
    );
    const { result } = renderController('7');

    await expect(
      result.current.controller.handlers.saveData(STATE),
    ).rejects.toThrow('save failed');
    expect(consoleError).toHaveBeenCalled();
  });

  it('resolves when the backend save succeeds', async () => {
    vi.mocked(gamedayApi.updateDesignerState).mockResolvedValueOnce({
      state_data: STATE,
    });
    const { result } = renderController('7');

    await expect(
      result.current.controller.handlers.saveData(STATE),
    ).resolves.toBeUndefined();
    expect(gamedayApi.updateDesignerState).toHaveBeenCalledWith(7, STATE);
  });

  it('no-ops without a gameday id (never calls the API)', async () => {
    const { result } = renderController(undefined);

    await expect(
      result.current.controller.handlers.saveData(STATE),
    ).resolves.toBeUndefined();
    expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
  });
});
