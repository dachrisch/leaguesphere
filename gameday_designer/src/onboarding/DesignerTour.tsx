import { useCallback } from 'react';
import { EventData, Joyride, STATUS, Step } from 'react-joyride';
import { trackEvent } from '../trackEvent';

interface DesignerTourProps {
  tourId: string;
  steps: Step[];
  run: boolean;
  onFinish: () => void;
  requireRealAction?: boolean;
}

function DesignerTour({ tourId, steps, run, onFinish, requireRealAction = false }: DesignerTourProps) {
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
      }}
      locale={{
        back: 'Zurück',
        next: 'Weiter',
        nextWithProgress: 'Weiter ({current} von {total})',
        skip: 'Überspringen',
        last: 'Fertig',
      }}
    />
  );
}

export default DesignerTour;
