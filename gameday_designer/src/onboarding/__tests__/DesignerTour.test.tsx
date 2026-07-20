import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DesignerTour from '../DesignerTour';
import { trackEvent } from '../../trackEvent';

vi.mock('../../trackEvent', () => ({ trackEvent: vi.fn() }));

let capturedCallback: ((data: unknown) => void) | undefined;
let capturedOptions: { buttons?: string[] } | undefined;

vi.mock('react-joyride', () => ({
  __esModule: true,
  Joyride: (props: { onEvent: (data: unknown) => void; options?: { buttons?: string[] } }) => {
    capturedCallback = props.onEvent;
    capturedOptions = props.options;
    return null;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' },
}));

describe('DesignerTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = undefined;
    capturedOptions = undefined;
  });

  it('tracks a step_complete event when step:after fires', () => {
    const steps = [{ target: '#add-field-button', content: 'Add a field' }];
    render(
      <DesignerTour
        tourId="manual_build"
        steps={steps}
        run={true}
        onFinish={() => {}}
      />
    );

    capturedCallback?.({
      status: 'running',
      type: 'step:after',
      index: 0,
    });

    expect(trackEvent).toHaveBeenCalledWith('gd_tour_manual_build_step_completed', {
      step_id: '#add-field-button',
      step_index: 0,
    });
  });

  it('tracks completed and calls onFinish when status is finished', () => {
    const onFinish = vi.fn();
    render(
      <DesignerTour
        tourId="manual_build"
        steps={[]}
        run={true}
        onFinish={onFinish}
      />
    );

    capturedCallback?.({
      status: 'finished',
      type: 'finished',
      index: 2,
    });

    expect(trackEvent).toHaveBeenCalledWith('gd_tour_manual_build_completed', {
      step_index: 2,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('tracks skipped and calls onFinish when status is skipped', () => {
    const onFinish = vi.fn();
    render(
      <DesignerTour
        tourId="save_template"
        steps={[]}
        run={true}
        onFinish={onFinish}
      />
    );

    capturedCallback?.({
      status: 'skipped',
      type: 'skipped',
      index: 0,
    });

    expect(trackEvent).toHaveBeenCalledWith('gd_tour_save_template_skipped', {
      step_index: 0,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('omits the primary (Next) button when requireRealAction is true', () => {
    render(
      <DesignerTour
        tourId="manual_build"
        steps={[{ target: '[data-testid="create-gameday-button"]', content: 'Create one' }]}
        run={true}
        onFinish={() => {}}
        requireRealAction
      />
    );

    expect(capturedOptions?.buttons).toEqual(['back', 'close', 'skip']);
  });
});
