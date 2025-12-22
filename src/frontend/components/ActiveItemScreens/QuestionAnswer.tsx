import logo from 'src/assets/PBE-logo_600px.png';
import type { Snapshot } from 'valtio';

export const QuestionAnswer = ({
  item,
  languages
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    phase: 'answer';
    locked: boolean;
    graded: boolean;
    translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
  }>;
  languages: Snapshot<Record<string, { id: string; code: string; name: string }>>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      <h2 className='text-4xl font-serif font-semibold border-b border-accent pb-4'>Answers:</h2>
      {item.translations.map((t) => (
        <div key={t.languageCode} className='text-2xl font-serif'>
          [{languages[t.languageCode]?.name}] &nbsp;
          {t.answer} {t.clarification && <> ({t.clarification})</>}
        </div>
      ))}
    </div>
  );
};

QuestionAnswer.displayName = 'QuestionAnswer';
