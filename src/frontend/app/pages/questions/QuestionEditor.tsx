import { memo, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import { QuestionMetadata } from './QuestionMetadata';
import { QuestionTranslation } from './QuestionTranslation';
import { useQuestionsValt } from './questionsValt';

export const QuestionEditor = memo(() => {
  const questionsValt = useQuestionsValt();
  const snap = useSnapshot(questionsValt.store);

  // Create a map of translations for quick lookup
  const translationMap = useMemo(() => {
    if (!snap.selectedQuestion) return new Map();

    return new Map(
      snap.selectedQuestion.translations.map((t) => [t.languageCode, t])
    );
  }, [snap.selectedQuestion]);

  if (!snap.selectedQuestion) {
    return null;
  }

  return (
    <div className='QuestionEditor flex-1 overflow-y-auto h-full'>
      <h3 className='text-xl font-bold mb-4'>Question {snap.selectedQuestion.number}</h3>

      {/* Question Metadata Section */}
      <QuestionMetadata question={snap.selectedQuestion} />

      {/* Translations Section */}
      <div className='QuestionTranslations'>
        <div className='flex flex-col gap-4'>
          {snap.languages.map((language) => {
            const translation = translationMap.get(language.code);

            return (
              <QuestionTranslation
                key={language.code}
                question={snap.selectedQuestion!}
                languageCode={language.code}
                languageName={language.name}
                translation={translation}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

QuestionEditor.displayName = 'QuestionEditor';
