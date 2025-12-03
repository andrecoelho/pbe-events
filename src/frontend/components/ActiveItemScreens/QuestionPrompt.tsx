import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
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
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <QuestionTimer active startTime={item.startTime} seconds={item.seconds} />
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
