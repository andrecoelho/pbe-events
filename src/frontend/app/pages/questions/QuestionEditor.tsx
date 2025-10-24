import { memo } from 'react';
import { useSnapshot } from 'valtio';
import { QuestionMetadata } from './QuestionMetadata';
import { QuestionTranslationFields } from './QuestionTranslationFields';
import { useQuestionsValt } from './questionsValt';

export const QuestionEditor = memo(() => {
  const questionsValt = useQuestionsValt();
  const snap = useSnapshot(questionsValt.store);

  if (!snap.selectedQuestion) {
    return null;
  }

  return (
    <div className='QuestionEditor flex-1 overflow-y-auto h-full'>
      <h3 className='text-xl font-bold mb-4'>Question {snap.selectedQuestion.number}</h3>

      {/* Question Metadata Section */}
      <QuestionMetadata />

      {/* Translations Section */}
      <div className='QuestionTranslations'>
        <div className='flex flex-col gap-4'>
          {snap.languages.map((language) => {
            const translation = snap.selectedQuestion?.translations.find((t) => t.languageCode === language.code);

            return (
              <QuestionTranslationFields
                key={language.code}
                languageCode={language.code}
                languageName={language.name}
                translation={translation}
                questionType={snap.selectedQuestion?.type ?? 'PG'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

QuestionEditor.displayName = 'QuestionEditor';
