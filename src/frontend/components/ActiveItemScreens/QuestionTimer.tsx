import { Icon } from '@/frontend/components/Icon';

interface Props {
  seconds: number; // total seconds for the timer
  active?: boolean; // whether to render the timer (default: true)
  locked?: boolean; // whether the question is locked (default: false)
  gracePeriod?: number; // optional grace period in seconds
  remainingSeconds: number; // optional externally controlled remaining seconds
  hasStartTime: boolean;
}

export const QuestionTimer = ({ seconds, active = true, locked = false, remainingSeconds, hasStartTime }: Props) => {
  const percentRemaining = (remainingSeconds / seconds) * 100;

  // Determine gradient class based on percentage
  let gradientClass = 'from-slate-500 via-gray-700 to-slate-900'; // Default inactive state
  let timerContent: React.ReactNode = seconds.toString();

  if (!active) {
    gradientClass = 'from-slate-500 via-gray-700 to-slate-900';
    timerContent = seconds.toString();
  } else if (locked) {
    gradientClass = 'from-gray-500 via-gray-600 to-gray-700'; // Locked (gray)
    timerContent = <Icon name='lock-closed' className='size-10 text-base-100' />;
  } else if (hasStartTime) {
    timerContent = remainingSeconds;

    if (percentRemaining <= 20) {
      gradientClass = 'from-orange-500 via-red-500 to-rose-600'; // < 20% red
    } else if (percentRemaining <= 50) {
      gradientClass = 'from-yellow-500 via-orange-500 to-amber-600'; // 20-50% yellow
    } else {
      gradientClass = 'from-green-500 via-emerald-500 to-teal-600'; // > 50% green
    }
  } else {
    timerContent = '∞';
    gradientClass = 'from-info via-sky-500 to-indigo-500'; // No timer (blue)
  }

  return (
    <div
      className={`absolute top-4 right-4 size-16 rounded-xl text-base-100 text-4xl font-bold flex items-center justify-center bg-gradient-to-br ${gradientClass} shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100`}
    >
      {timerContent}
    </div>
  );
};

QuestionTimer.displayName = 'QuestionTimer';
