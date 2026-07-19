import { useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { trackEvent } from '../trackEvent';

interface DesignerTourProps {
  tourId: string;
  steps: Step[];
  run: boolean;
  onFinish: () => void;
}

function DesignerTour({ tourId, steps, run, onFinish }: DesignerTourProps) {
  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
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

      if (type === 'step:after' || type === 'target:after') {
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
      callback={handleJoyrideCallback}
      continuous
      showSkipButton
      showProgress
      locale={{ back: 'Zurück', next: 'Weiter', skip: 'Überspringen', last: 'Fertig' }}
    />
  );
}

export default DesignerTour;
