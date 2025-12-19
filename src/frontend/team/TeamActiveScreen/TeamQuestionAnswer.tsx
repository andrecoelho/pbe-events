import { useTeamValt } from '@/frontend/team/teamValt';
import logo from 'src/assets/favicon.svg';
import { useSnapshot, type Snapshot } from 'valtio';

export const TeamQuestionAnswer = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem as Snapshot<{
    type: 'question';
    id: string;
    number: number;
    phase: 'answer';
    translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
  }>;

  const translation = activeItem.translations.find((t) => t.languageCode === snap.team?.languageCode);

  if (!translation) {
    return null;
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{activeItem.number}</h1>
      </div>
      <h2 className='text-4xl font-serif font-semibold border-b border-accent pb-4'>Answer:</h2>
      <div className='flex gap-2'>
        <span className='text-2xl font-serif w-40 text-right'>Official:</span>
        <span className='badge badge-lg bg-green-400'>
          {translation.answer} {translation.clarification && <>({translation.clarification})</>}
        </span>
      </div>
      <div className='flex gap-2'>
        <span className='text-2xl font-serif w-40 text-right'>Your Answer:</span>
        <span className='badge badge-lg badge-neutral'>{snap.answer}</span>
      </div>
    </div>
  );
};

TeamQuestionAnswer.displayName = 'TeamQuestionAnswer';
