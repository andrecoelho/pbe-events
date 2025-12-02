import { RunValtContext } from '@/frontend/app/pages/runs/runValt';
import { useContext, useEffect, useState } from 'react';
import logo from 'src/assets/favicon.svg';
import { useSnapshot, type Snapshot } from 'valtio';

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
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex justify-center mt-10'>
        <img src={logo} className='h-28' />
      </div>
      <h1 className='text-6xl font-serif text-center'>{item.title}</h1>
      {item.remarks && <div className='text-2xl font-serif text-center whitespace-pre-wrap'>{item.remarks}</div>}
    </div>
  );
}

const Slide = ({
  item
}: {
  item: Snapshot<{
    type: 'slide';
    number: number;
    content: string;
  }>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex justify-center mt-10'>
        <img src={logo} className='h-28' />
      </div>
      <div className='text-xl font-serif whitespace-pre-wrap text-center'>{item.content}</div>
    </div>
  );
}

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
    startTime: string;
    translations: Array<{ languageCode: string; prompt: string }>;
  }>;
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(item.seconds);

  useEffect(() => {
    // Initialize with current seconds
    setRemainingSeconds(item.seconds);

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
  }, [item.seconds]);

  // Calculate percentage remaining
  const totalSeconds = item.seconds;
  const percentRemaining = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;

  // Determine gradient class based on percentage
  let gradientClass = 'from-orange-500 via-red-500 to-rose-600'; // < 20%

  if (percentRemaining > 50) {
    gradientClass = 'from-green-500 via-emerald-500 to-teal-600'; // > 50%
  } else if (percentRemaining > 20) {
    gradientClass = 'from-yellow-500 via-orange-500 to-amber-600'; // 20-50%
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className={`absolute top-4 right-4 size-16 rounded-xl text-base-100 text-4xl font-bold flex items-center justify-center bg-gradient-to-br ${gradientClass} shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100 transition-colors duration-500`}>
        {remainingSeconds}
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

const QuestionAnswer = ({
  item
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    phase: 'answer';
    translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
  }>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      {item.translations.map((t) => (
        <div key={t.languageCode} className='text-2xl font-serif'>
          ({t.languageCode.toUpperCase()}) &nbsp;
          {t.answer} {t.clarification && <> ({t.clarification})</>}
        </div>
      ))}
    </div>
  );
};

export const ActiveItem = () => {
  const runValt = useContext(RunValtContext);
  const snap = useSnapshot(runValt!.store);
  const activeItem = snap.run.activeItem;

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
    return <QuestionAnswer item={activeItem} />;
  }

  return null;
};
