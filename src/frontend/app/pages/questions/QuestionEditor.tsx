import { memo } from 'react';
import { useSnapshot } from 'valtio';
import { QuestionMetadata } from './QuestionMetadata';
import { QuestionTranslation } from './QuestionTranslation';
import { useQuestionsValt } from './questionsValt';

export const QuestionEditor = memo(() => {
  const questionsValt = useQuestionsValt();
  const snap = useSnapshot(questionsValt.store);
  const selectedQuestion = snap.selectedQuestion;

  if (!selectedQuestion) {
    return (
      <div className='QuestionEditor flex-1 flex items-center justify-center h-full'>
        <span className='text-neutral'>Select a question to edit</span>
      </div>
    );
  }

  return (
    <div className='QuestionEditor flex-1 overflow-y-auto h-full'>
      <h3 className='text-xl font-bold mb-4'>Question {selectedQuestion.number}</h3>

      <QuestionMetadata />

      <div className='QuestionTranslations'>
        <div className='flex flex-col gap-4'>
          {Object.values(selectedQuestion.translations)
            .sort((a, b) => a.languageCode.localeCompare(b.languageCode))
            .map((translation) => {
              return (
                <QuestionTranslation
                  key={translation.languageCode}
                  languageCode={translation.languageCode}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
});

QuestionEditor.displayName = 'QuestionEditor';
