import { Icon } from '@/frontend/components/Icon';
import { useTeamValt } from '@/frontend/team/teamValt';
import type { ActiveItem } from '@/types';
import logo from 'src/assets/PBE-logo_600px.png';
import { useSnapshot, type Snapshot } from 'valtio';

export const TeamQuestionAnswer = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem as Snapshot<Extract<ActiveItem, { type: 'question'; phase: 'answer' }>>;
  const translation = activeItem.translations.find((t) => t.languageCode === snap.team?.languageCode);
  const answer = activeItem.answers[snap.team!.id];

  const handleChallengeClick = () => {
    valt.submitChallenge(true);
  };

  const handleClearChallengeClick = () => {
    valt.submitChallenge(false);
  };

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{activeItem.number}</h1>
      </div>
      <h2 className='border-b border-accent pb-4 flex justify-between'>
        <span className='text-4xl font-serif font-semibold '>Answer:</span>
        {answer && answer.answerId && !activeItem.locked && !answer.challenged && (
          <button className='btn btn-error ml-auto' onClick={handleChallengeClick}>
            <Icon name='face-frown' className='size-6 text-base-100' />
            Challenge Question
          </button>
        )}
        {answer && answer.answerId && !activeItem.locked && answer.challenged && (
          <button className='btn btn-success ml-auto' onClick={handleClearChallengeClick}>
            <Icon name='face-smile' className='size-6 text-base-100' />
            Clear Challenge
          </button>
        )}
      </h2>
      <div className='flex gap-2 items-center'>
        <span className='text-2xl font-serif w-40 text-right flex-none'>Correct:</span>
        <span className='bg-green-400 text-base-content rounded-md px-2 py-1 border-base-100 border'>
          {translation?.answer} {translation?.clarification && <>({translation.clarification})</>}
        </span>
      </div>
      <div className='flex gap-2'>
        <span className='text-2xl font-serif w-40 text-right flex-none'>Your Answer:</span>
        <span className='bg-neutral text-base-content rounded-md px-2 py-1 border-base-100 border'>
          {answer?.answerText}
        </span>
      </div>
    </div>
  );
};

TeamQuestionAnswer.displayName = 'TeamQuestionAnswer';
