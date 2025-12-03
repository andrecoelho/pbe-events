import { useEffect, useState } from 'react';
import logo from 'src/assets/favicon.svg';
import type { Snapshot } from 'valtio';

export const QuestionPrompt = ({
  item
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    questionType: 'PG' | 'PS' | 'TF' | 'FB';
    maxPoints: number;
    phase: 'prompt';
    seconds: number;
    startTime: string | null;
    translations: Array<{ languageCode: string; prompt: string }>;
  }>;
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (!item.startTime) {
      return item.seconds;
    }

    // Calculate initial remaining seconds based on start time
    const startTimeMs = new Date(item.startTime).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.floor((nowMs - startTimeMs) / 1000);
    const remaining = Math.max(0, item.seconds - elapsedSeconds);

    return remaining;
  });

  useEffect(() => {
    if (!item.startTime) {
      return;
    }

    // Calculate initial remaining seconds based on start time
    const startTimeMs = new Date(item.startTime).getTime();
    const nowMs = Date.now();
    const elapsedSeconds = Math.floor((nowMs - startTimeMs) / 1000);
    const remaining = Math.max(0, item.seconds - elapsedSeconds);
    setRemainingSeconds(remaining);

    // Set up interval to count down
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Clean up on unmount
    return () => clearInterval(interval);
  }, [item.seconds, item.startTime]);

  // Calculate percentage remaining
  const totalSeconds = item.seconds;
  const percentRemaining = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;

  // Determine gradient class based on percentage
  let gradientClass = 'from-info via-sky-500 to-indigo-500'; // Default/not started (blue like connected team badge)

  if (item.startTime) {
    if (percentRemaining <= 20) {
      gradientClass = 'from-orange-500 via-red-500 to-rose-600'; // < 20%
    } else if (percentRemaining <= 50) {
      gradientClass = 'from-yellow-500 via-orange-500 to-amber-600'; // 20-50%
    } else {
      gradientClass = 'from-green-500 via-emerald-500 to-teal-600'; // > 50%
    }
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div
        className={`absolute top-4 right-4 size-16 rounded-xl text-base-100 text-4xl font-bold flex items-center justify-center bg-gradient-to-br ${gradientClass} shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100 transition-colors duration-500`}
      >
        {item.startTime ? remainingSeconds : '∞'}
      </div>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      {item.translations.map((t) => (
        <div key={t.languageCode} className='text-2xl font-serif'>
          ({item.maxPoints} pts.) &nbsp;
          {t.prompt}
        </div>
      ))}
    </div>
  );
};

QuestionPrompt.displayName = 'QuestionPrompt';
