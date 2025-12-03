import logo from 'src/assets/favicon.svg';
import type { Snapshot } from 'valtio';

export const TeamQuestionAnswer = ({
  item,
  languages
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    phase: 'answer';
    translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
  }>;
  languages: Snapshot<Record<string, { id: string; code: string; name: string }>>;
}) => {
  // Show only the first translation
  const translation = item.translations[0];

  if (!translation) {
    return null;
  }

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      <h2 className='text-4xl font-serif font-semibold border-b border-accent pb-4'>Answer:</h2>
      <div className='text-2xl font-serif'>
        {translation.answer} {translation.clarification && <> ({translation.clarification})</>}
      </div>
    </div>
  );
};

TeamQuestionAnswer.displayName = 'TeamQuestionAnswer';
