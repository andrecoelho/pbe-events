import { memo } from 'react';
import { useSnapshot } from 'valtio';
import { useQuestionsValt, type IQuestionTranslation } from './questionsValt';

interface QuestionTranslationFieldsProps {
  languageCode: string;
  languageName: string;
  translation: IQuestionTranslation | undefined;
  questionType: string;
}

export const QuestionTranslation = memo(
  ({ languageCode, languageName, translation, questionType }: QuestionTranslationFieldsProps) => {
    const questionsValt = useQuestionsValt();
    const snap = useSnapshot(questionsValt.store);

    const handleTranslationChange = async (field: 'prompt' | 'answer', value: string) => {
      if (!snap.selectedQuestion) return;

      const prompt = field === 'prompt' ? value : translation?.prompt ?? '';
      const answer = field === 'answer' ? value : translation?.answer ?? '';

      await questionsValt.upsertTranslation(snap.selectedQuestion.id, languageCode, prompt, answer);
    };

    return (
      <fieldset className='fieldset bg-base-300 border-neutral rounded-box border p-4'>
        <legend className='fieldset-legend'>
          {languageName} ({languageCode.toUpperCase()})
        </legend>
        <div className='flex flex-col gap-3'>
          {/* Prompt */}
          <div>
            <label className='label'>
              <span className='label-text'>Prompt</span>
            </label>
            <textarea
              className='textarea textarea-bordered w-full'
              rows={3}
              placeholder='Enter the question prompt...'
              value={translation?.prompt || ''}
              onChange={(e) => handleTranslationChange('prompt', e.target.value)}
            />
          </div>

          {/* Answer */}
          <div>
            <label className='label'>
              <span className='label-text'>Answer</span>
            </label>
            {questionType === 'TF' ? (
              <label className='label cursor-pointer justify-start gap-2 flex place-items-center mt-2'>
                <input
                  type='checkbox'
                  className={`toggle ${translation?.answer === 'true' ? 'toggle-success' : 'toggle-error'}`}
                  checked={translation?.answer === 'true'}
                  onChange={(e) => handleTranslationChange('answer', e.target.checked ? 'true' : 'false')}
                />
                <span className={`text-base ${translation?.answer === 'true' ? 'text-success' : 'text-error'}`}>
                  {translation?.answer === 'true' ? 'True' : 'False'}
                </span>
              </label>
            ) : (
              <input
                type='text'
                className='input input-bordered w-full'
                placeholder='Enter the answer...'
                value={translation?.answer || ''}
                onChange={(e) => handleTranslationChange('answer', e.target.value)}
              />
            )}
          </div>
        </div>
      </fieldset>
    );
  }
);

QuestionTranslation.displayName = 'QuestionTranslationFields';
