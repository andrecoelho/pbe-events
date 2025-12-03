import logo from 'src/assets/favicon.svg';
import type { Snapshot } from 'valtio';

export const QuestionReading = ({
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
