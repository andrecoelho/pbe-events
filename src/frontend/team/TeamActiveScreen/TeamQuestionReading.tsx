import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import { useTeamValt } from '@/frontend/team/teamValt';
import logo from 'src/assets/favicon.svg';
import { useSnapshot, type Snapshot } from 'valtio';

export const TeamQuestionReading = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem as Snapshot<{
    type: 'question';
    id: string;
    number: number;
    questionType: 'PG' | 'PS' | 'TF' | 'FB';
    maxPoints: number;
    phase: 'reading';
    seconds: number;
    translations: Array<{ languageCode: string; prompt: string }>;
  }>;

  const translation = activeItem.translations.find((t) => t.languageCode === snap.team?.languageCode);

  if (!translation) {
    return null;
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10 leading-loose'>
      <QuestionTimer active={false} seconds={activeItem.seconds} />
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{activeItem.number}</h1>
      </div>
      <div className='text-2xl font-serif leading-loose'>
        ({activeItem.maxPoints} pts.) &nbsp;
        {translation.prompt}
      </div>
    </div>
  );
};

TeamQuestionReading.displayName = 'TeamQuestionReading';
