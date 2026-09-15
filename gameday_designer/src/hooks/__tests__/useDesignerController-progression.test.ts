import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDesignerController } from '../useDesignerController';
import { useFlowState } from '../useFlowState';
import * as flowchartExport from '../../utils/flowchartExport';

/**
 * Regression test locking in the non-blocking guarantee for Expert Mode
 * (see src/types/progression.ts and useProgressionInspection.ts): expert-only
 * progression findings must never prevent or interfere with saving or
 * exporting, even when findings are present.
 */
vi.mock('../../utils/flowchartExport', () => ({
  downloadFlowchartAsJson: vi.fn(),
  validateForExport: vi.fn(() => []),
}));

describe('useDesignerController — Expert Mode non-blocking guarantee', () => {
  it('still exports successfully when expert-mode progression findings are present', () => {
    const { result } = renderHook(() => {
      const flowState = useFlowState();
      return { flowState, controller: useDesignerController(undefined, flowState, undefined, true) };
    });

    act(() => {
      result.current.controller.handlers.handleAddFieldContainer();
    });
    const stageNode = result.current.flowState.nodes.find((n) => n.type === 'stage');
    act(() => {
      // A winner reference to a non-existent match — guaranteed to produce an
      // expert-only "dangling_reference" finding once expert mode is on.
      result.current.flowState.addGameNodeInStage(stageNode!.id, {
        standing: 'Finale',
        homeTeamDynamic: { type: 'winner', matchName: 'Does Not Exist' },
      });
    });

    expect(result.current.controller.progression.findings.length).toBeGreaterThan(0);

    act(() => {
      result.current.controller.handlers.handleExport();
    });

    expect(vi.mocked(flowchartExport.downloadFlowchartAsJson)).toHaveBeenCalled();
  });

  it('does not save/export any expert-mode data — progression is absent from the exported FlowState shape', () => {
    const { result } = renderHook(() => {
      const flowState = useFlowState();
      return { flowState, controller: useDesignerController(undefined, flowState, undefined, true) };
    });

    const exported = result.current.flowState.exportState();

    expect(exported).not.toHaveProperty('progression');
    expect(exported).not.toHaveProperty('expertMode');
  });
});
