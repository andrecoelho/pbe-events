import { useEffect, useState } from 'react';
import { Icon } from '@/frontend/components/Icon';

interface TimerDisplayProps {
  startTime: string;
  seconds: number;
  gracePeriod: number;
}

export function TimerDisplay({ startTime, seconds, gracePeriod }: TimerDisplayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const start = new Date(startTime).getTime();
      const elapsedSeconds = Math.floor((now - start) / 1000);

      setElapsed(elapsedSeconds);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime]);

  const remaining = Math.max(0, seconds - elapsed);
  const inGracePeriod = elapsed > seconds;
  const graceRemaining = Math.max(0, gracePeriod - (elapsed - seconds));

  return (
    <div
      className={`card shadow-xl ${inGracePeriod ? 'bg-error text-error-content' : 'bg-primary text-primary-content'}`}
    >
      <div className='card-body p-4 flex-row items-center justify-between'>
        <div className='flex items-center gap-3'>
          <Icon name='clock' className='size-8' />
          <div>
            <div className='text-4xl font-bold tabular-nums'>
              {inGracePeriod ? graceRemaining : remaining}s
            </div>
            <div className='text-sm opacity-90'>{inGracePeriod ? 'Grace Period' : 'Time Remaining'}</div>
          </div>
        </div>
        {inGracePeriod && (
          <div className='text-right'>
            <div className='text-lg font-semibold'>⚠️ Deadline Passed</div>
            <div className='text-sm opacity-90'>Grace: {graceRemaining}s remaining</div>
          </div>
        )}
      </div>
    </div>
  );
}

TimerDisplay.displayName = 'TimerDisplay';
