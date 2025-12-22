import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import type { ActiveItem } from '@/types';
import logo from 'src/assets/PBE-logo_600px.png';
import type { Snapshot } from 'valtio';

export const QuestionReading = ({
  item
}: {
  item: Snapshot<Extract<ActiveItem, { type: 'question'; phase: 'reading' }>>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <QuestionTimer
        active={false}
        hasStartTime={false}
        remainingSeconds={item.seconds}
        seconds={item.seconds}
      />
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
