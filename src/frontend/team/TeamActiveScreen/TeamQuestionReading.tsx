import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import { useTeamValt } from '@/frontend/team/teamValt';
import type { ActiveItem } from '@/types';
import logo from 'src/assets/PBE-logo_600px.png';
import { useSnapshot, type Snapshot } from 'valtio';

export const TeamQuestionReading = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem as Snapshot<Extract<ActiveItem, { type: 'question'; phase: 'prompt' }>>;
  const translation = activeItem.translations.find((t) => t.languageCode === snap.team?.languageCode);

  if (!translation) {
    return null;
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10 leading-loose'>
      <QuestionTimer
        active={false}
        seconds={activeItem.seconds}
        hasStartTime={activeItem.startTime !== null}
        remainingSeconds={activeItem.remainingSeconds}
      />
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
