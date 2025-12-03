import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import logo from 'src/assets/favicon.svg';
import type { Snapshot } from 'valtio';

export const TeamQuestionReading = ({
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
  // Show only the first translation
  const translation = item.translations[0];

  if (!translation) {
    return null;
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10 leading-loose'>
      <QuestionTimer active={false} seconds={item.seconds} startTime={null} />
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      <div className='text-2xl font-serif leading-loose'>
        ({item.maxPoints} pts.) &nbsp;
        {translation.prompt}
      </div>
    </div>
  );
};

TeamQuestionReading.displayName = 'TeamQuestionReading';
