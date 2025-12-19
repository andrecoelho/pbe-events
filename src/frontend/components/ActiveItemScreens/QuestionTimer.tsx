import { useEffect, useState } from 'react';

interface Props {
  startTime?: string | null; // ISO string or null
  seconds: number; // total seconds for the timer
  active?: boolean; // whether to render the timer (default: true)
  locked?: boolean; // whether the question is locked (default: false)
  gracePeriod?: number; // optional grace period in seconds
  onTimeUp?: () => void; // optional callback when time is up
}

export const QuestionTimer = ({
  startTime,
  seconds,
  active = true,
  locked = false,
  gracePeriod = 0,
  onTimeUp
}: Props) => {
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (!active || !startTime) {
      return seconds;
    }

    // Calculate initial remaining seconds based on start time
    const startTimeMs = new Date(startTime).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.floor((nowMs - startTimeMs) / 1000);
    const remaining = Math.max(-gracePeriod, seconds - elapsedSeconds);

    return remaining;
  });

  useEffect(() => {
    if (!active || !startTime) {
      return;
    }

    // Calculate initial remaining seconds based on start time
    const startTimeMs = new Date(startTime).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.floor((nowMs - startTimeMs) / 1000);
    const remaining = Math.max(-gracePeriod, seconds - elapsedSeconds);

    setRemainingSeconds(remaining);

    // Set up interval to count down
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;

        // Check if we've exceeded the total time + grace period
        if (next <= -gracePeriod) {
          clearInterval(interval);

          if (onTimeUp) {
            onTimeUp();
          }
          return 0;
        }

        return next;
      });
    }, 1000);

    // Clean up on unmount
    return () => clearInterval(interval);
  }, [seconds, startTime, active, gracePeriod, onTimeUp]);

  // Calculate percentage remaining
  const totalSeconds = seconds;
  const percentRemaining = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;

  // Determine gradient class based on percentage
  let gradientClass = 'from-slate-500 via-gray-700 to-slate-900'; // Default inactive state

  if (!active) {
    gradientClass = 'from-slate-500 via-gray-700 to-slate-900';
  } else if (locked) {
    gradientClass = 'from-gray-500 via-gray-600 to-gray-700'; // Locked (gray)
  } else if (startTime) {
    if (percentRemaining <= 20) {
      gradientClass = 'from-orange-500 via-red-500 to-rose-600'; // < 20%
    } else if (percentRemaining <= 50) {
      gradientClass = 'from-yellow-500 via-orange-500 to-amber-600'; // 20-50%
    } else {
      gradientClass = 'from-green-500 via-emerald-500 to-teal-600'; // > 50%
    }
  } else {
    gradientClass = 'from-info via-sky-500 to-indigo-500'; // Not started (blue)
  }

  let timerContent: React.ReactNode = '∞';

  if (active) {
    if (locked) {
      timerContent = (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 24 24'
          fill='currentColor'
          className='size-10 text-base-100'
        >
          <path
            fill-rule='evenodd'
            d='M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z'
            clip-rule='evenodd'
          />
        </svg>
      );
    } else if (startTime) {
      timerContent = Math.max(0, remainingSeconds).toString();
    }
  } else {
    timerContent = seconds.toString();
  }

  return (
    <div
      className={`absolute top-4 right-4 size-16 rounded-xl text-base-100 text-4xl font-bold flex items-center justify-center bg-gradient-to-br ${gradientClass} shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100 transition-colors duration-500`}
    >
      {timerContent}
    </div>
  );
};

QuestionTimer.displayName = 'QuestionTimer';
