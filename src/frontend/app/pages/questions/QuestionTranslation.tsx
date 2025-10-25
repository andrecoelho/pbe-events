import { debounce } from 'lodash';
import { memo, useCallback, useRef } from 'react';
import { useQuestionsValt, type IQuestionTranslation, type Question } from './questionsValt';
import { useSnapshot, type Snapshot } from 'valtio';

interface Props {
  question: Snapshot<Question>;
  translation: Snapshot<IQuestionTranslation>;
}

export const QuestionTranslation = memo(({ question, translation }: Props) => {
  const questionsValt = useQuestionsValt();
  const snap = useSnapshot(questionsValt.store);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  const handleTranslationChange = useCallback(
    debounce(
      async (question: Question, translation: IQuestionTranslation, field: 'prompt' | 'answer', value: string) => {
        await questionsValt.upsertTranslation(question, translation, { [field]: value });
      },
      500
    ),
    [questionsValt]
  );

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    questionsValt.changeStoreTranslation(question, translation, { prompt: e.target.value });
    handleTranslationChange(question, translation, 'prompt', e.target.value);
  };

  const handleAnswerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = question.type === 'TF' ? (e.target.checked ? 'true' : 'false') : e.target.value;

    questionsValt.changeStoreTranslation(question, translation, { answer: value });
    handleTranslationChange(question, translation, 'answer', value);
  };

  return (
    <fieldset className='fieldset bg-base-300 border-neutral rounded-box border p-4'>
      <legend className='fieldset-legend'>
        {snap.languages[translation.languageCode]} ({translation.languageCode.toUpperCase()})
      </legend>
      <div className='flex flex-col gap-3'>
        {/* Prompt */}
        <div>
          <label className='label'>
            <span className='label-text'>Prompt</span>
          </label>
          <textarea
            ref={promptRef}
            className='textarea textarea-bordered w-full'
            rows={3}
            placeholder='Enter the question prompt...'
            value={translation?.prompt || ''}
            onChange={handlePromptChange}
          />
        </div>

        {/* Answer */}
        <div>
          <label className='label'>
            <span className='label-text'>Answer</span>
          </label>
          {question.type === 'TF' ? (
            <label className='label cursor-pointer justify-start gap-2 flex place-items-center mt-2'>
              <input
                ref={answerRef}
                type='checkbox'
                className={`toggle ${translation?.answer === 'true' ? 'toggle-success' : 'toggle-error'}`}
                checked={translation?.answer === 'true'}
                onChange={handleAnswerChange}
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
              onChange={handleAnswerChange}
            />
          )}
        </div>
      </div>
    </fieldset>
  );
});

QuestionTranslation.displayName = 'QuestionTranslation';
