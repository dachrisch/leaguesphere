import { useCallback } from 'react';
import { EventData, Joyride, STATUS, Step } from 'react-joyride';
import { trackEvent } from '../trackEvent';
import { useTypedTranslation } from '../i18n/useTypedTranslation';

interface DesignerTourProps {
  tourId: string;
  steps: Step[];
  run: boolean;
  onFinish: () => void;
  requireRealAction?: boolean;
}

function DesignerTour({ tourId, steps, run, onFinish, requireRealAction = false }: DesignerTourProps) {
  const { t } = useTypedTranslation(['ui']);

  const handleJoyrideEvent = useCallback(
    (data: EventData) => {
      const { status, type, index } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        const eventName =
          status === STATUS.FINISHED
            ? `gd_tour_${tourId}_completed`
            : `gd_tour_${tourId}_skipped`;
        trackEvent(eventName, { step_index: index });
        onFinish();
        return;
      }

      if (type === 'step:after') {
        trackEvent(`gd_tour_${tourId}_step_completed`, {
          step_id: steps[index]?.target ?? '',
          step_index: index,
        });
      }
    },
    [tourId, steps, onFinish]
  );

  return (
    <Joyride
      steps={steps}
      run={run}
      onEvent={handleJoyrideEvent}
      continuous
      options={{
        buttons: requireRealAction ? ['back', 'close', 'skip'] : ['back', 'close', 'skip', 'primary'],
        showProgress: true,
        // AppHeader's navbar is fixed-top at z-index 1035 (Bootstrap's fixed
        // scale); a step targeting an element inside it, e.g. the Templates
        // button, would otherwise render its beacon/tooltip underneath it.
        zIndex: 1040,
      }}
      locale={{
        back: t('ui:tour.controls.back'),
        next: t('ui:tour.controls.next'),
        nextWithProgress: t('ui:tour.controls.nextWithProgress'),
        skip: t('ui:tour.controls.skip'),
        last: t('ui:tour.controls.last'),
      }}
    />
  );
}

export default DesignerTour;
