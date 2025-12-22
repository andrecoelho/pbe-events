import { useTeamValt } from '@/frontend/team/teamValt';
import logo from 'src/assets/PBE-logo_600px.png';
import { useSnapshot } from 'valtio';

export const TeamQuestionAnswer = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem;

  if (!activeItem || activeItem.type !== 'question' || activeItem.phase !== 'answer') {
    return null;
  }

  const translation = activeItem.translations.find((t) => t.languageCode === snap.team?.languageCode);

  if (!translation) {
    return null;
  }

  const answer = activeItem.answers[snap.team!.id];

  if (!answer) {
    return null;
  }

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
        {!activeItem.locked && !answer.challenged && (
          <button className='btn btn-error ml-auto' onClick={handleChallengeClick}>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='currentColor'
              className='size-6 text-base-100'
            >
              <path
                fillRule='evenodd'
                d='M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm-4.34 7.964a.75.75 0 0 1-1.061-1.06 5.236 5.236 0 0 1 3.73-1.538 5.236 5.236 0 0 1 3.695 1.538.75.75 0 1 1-1.061 1.06 3.736 3.736 0 0 0-2.639-1.098 3.736 3.736 0 0 0-2.664 1.098Z'
                clipRule='evenodd'
              />
            </svg>
            Challenge Question
          </button>
        )}
        {!activeItem.locked && answer.challenged && (
          <button className='btn btn-success ml-auto' onClick={handleClearChallengeClick}>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='currentColor'
              className='size-6 text-base-100'
            >
              <path
                fillRule='evenodd'
                d='M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm2.023 6.828a.75.75 0 1 0-1.06-1.06 3.75 3.75 0 0 1-5.304 0 .75.75 0 0 0-1.06 1.06 5.25 5.25 0 0 0 7.424 0Z'
                clipRule='evenodd'
              />
            </svg>
            Clear Challenge
          </button>
        )}
      </h2>
      <div className='flex gap-2 items-center'>
        <span className='text-2xl font-serif w-40 text-right flex-none'>Correct:</span>
        <span className='bg-green-400 text-base-content rounded-md px-2 py-1 border-base-100 border'>
          {translation.answer} {translation.clarification && <>({translation.clarification})</>}
        </span>
      </div>
      <div className='flex gap-2'>
        <span className='text-2xl font-serif w-40 text-right flex-none'>Your Answer:</span>
        <span className='bg-neutral text-base-content rounded-md px-2 py-1 border-base-100 border'>
          {answer.answerText}
        </span>
      </div>
    </div>
  );
};

TeamQuestionAnswer.displayName = 'TeamQuestionAnswer';
