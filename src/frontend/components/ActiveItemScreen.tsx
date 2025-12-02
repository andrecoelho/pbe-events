import type { ActiveItem } from '@/types';
import { useEffect, useState } from 'react';
import logo from 'src/assets/favicon.svg';
import { type Snapshot } from 'valtio';

const Title = ({
  item
}: {
  item: Snapshot<{
    type: 'title';
    title: string;
    remarks: string | null;
  }>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 p-8'>
      <div className='flex justify-center'>
        <img src={logo} className='h-28' />
      </div>
      <h1 className='text-6xl font-serif text-center'>{item.title}</h1>
      {item.remarks && <div className='text-2xl font-serif text-center whitespace-pre-wrap'>{item.remarks}</div>}
    </div>
  );
};

Title.displayName = 'Title';

const Slide = ({
  item
}: {
  item: Snapshot<{
    type: 'slide';
    number: number;
    content: string;
  }>;
}) => {
  const x = item.content.length;
  const fontSize = Math.floor(0.000266 * x * x - 0.23307 * x + 65.2201);

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 p-8'>
      <div className='flex justify-center'>
        <img src={logo} className='h-28' />
      </div>
      <div
        className='flex flex-1 items-center justify-center text-center font-serif whitespace-pre-wrap'
        style={{ fontSize: `${fontSize}px` }}
      >
        {item.content}
      </div>
    </div>
  );
};

Slide.displayName = 'Slide';

const QuestionReading = ({
  item
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    questionType: 'PG' | 'PS' | 'TF' | 'FB';
    maxPoints: number;
    phase: 'reading';
    seconds: number;
    translations: Array<{ languageCode: string; prompt: string }>;
  }>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='absolute top-4 right-4 size-16 rounded-xl text-base-100 text-4xl font-bold flex items-center justify-center bg-gradient-to-br from-slate-500 via-gray-700 to-slate-900 shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100'>
        {item.seconds}
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

QuestionReading.displayName = 'QuestionReading';

const QuestionPrompt = ({
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

const QuestionAnswer = ({
  item,
  languages
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    phase: 'answer';
    translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
  }>;
  languages: Record<string, { id: string; code: string; name: string }>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      <h2 className='text-4xl font-serif font-semibold border-b border-accent pb-4'>Answers:</h2>
      {item.translations.map((t) => (
        <div key={t.languageCode} className='text-2xl font-serif'>
          [{languages[t.languageCode]?.name}] &nbsp;
          {t.answer} {t.clarification && <> ({t.clarification})</>}
        </div>
      ))}
    </div>
  );
};

QuestionAnswer.displayName = 'QuestionAnswer';

const NotStarted = () => {
  return (
    <div className='absolute inset-0 flex flex-col items-center justify-center text-base-100 gap-8 px-10'>
      <img src={logo} className='h-28' />
    </div>
  );
};

NotStarted.displayName = 'NotStarted';

const Paused = () => {
  return (
    <div className='absolute inset-0 flex flex-col items-center justify-center text-base-100 gap-8 px-10'>
      <img src={logo} className='h-28' />
      <h1 className='text-5xl text-center'>The event is paused.</h1>
    </div>
  );
};

Paused.displayName = 'Paused';

const Completed = () => {
  return (
    <div className='absolute inset-0 flex flex-col items-center justify-center text-base-100 gap-8 px-10'>
      <img src={logo} className='h-28' />
      <h1 className='text-5xl text-center'>
        The event is completed.
        <br />
        Thank you!
      </h1>
    </div>
  );
};

Completed.displayName = 'Completed';

export const ActiveItemScreen = (props: {
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages: Record<string, { id: string; code: string; name: string }>;
  activeItem: Snapshot<ActiveItem> | null;
}) => {
  const activeItem = props.activeItem;

  if (props.runStatus === 'not_started') {
    return <NotStarted />;
  }

  if (props.runStatus === 'paused') {
    return <Paused />;
  }

  if (props.runStatus === 'completed') {
    return <Completed />;
  }

  if (activeItem?.type === 'title') {
    return <Title item={activeItem} />;
  }

  if (activeItem?.type === 'slide') {
    return <Slide item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'reading') {
    return <QuestionReading item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'prompt') {
    return <QuestionPrompt item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'answer') {
    return <QuestionAnswer item={activeItem} languages={props.languages} />;
  }

  return null;
};

ActiveItemScreen.displayName = 'ActiveItemScreen';
