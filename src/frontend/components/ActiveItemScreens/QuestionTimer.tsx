import { useEffect, useState } from 'react';

interface Props {
  startTime?: string | null; // ISO string or null
  seconds: number; // total seconds for the timer
  active?: boolean; // whether to render the timer (default: true)
  gracePeriod?: number; // optional grace period in seconds
  onTimeUp?: () => void; // optional callback when time is up
}

export const QuestionTimer = ({ startTime, seconds, active = true, gracePeriod = 0, onTimeUp }: Props) => {
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

  return (
    <div
      className={`absolute top-4 right-4 size-16 rounded-xl text-base-100 text-4xl font-bold flex items-center justify-center bg-gradient-to-br ${gradientClass} shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100 transition-colors duration-500`}
    >
      {!active ? seconds : startTime ? Math.max(0, remainingSeconds) : '∞'}
    </div>
  );
};

QuestionTimer.displayName = 'QuestionTimer';
