import { memo } from 'react';
import { useSnapshot } from 'valtio';
import { useQuestionsValt, type QuestionType } from './questionsValt';

const QUESTION_TYPES = [
  { value: 'PG', label: 'Points General' },
  { value: 'PS', label: 'Points Specific' },
  { value: 'TF', label: 'True/False' },
  { value: 'FB', label: 'Fill in the Blank' }
];

export const QuestionMetadata = memo(() => {
  const questionsValt = useQuestionsValt();
  const snap = useSnapshot(questionsValt.store);

  if (!snap.selectedQuestion) return null;

  const handleQuestionTypeChange = async (type: QuestionType) => {
    if (!snap.selectedQuestion) return;
    await questionsValt.updateQuestion(snap.selectedQuestion.id, { type });
  };

  const handleMaxPointsChange = async (maxPoints: number) => {
    if (!snap.selectedQuestion) return;
    await questionsValt.updateQuestion(snap.selectedQuestion.id, { maxPoints });
  };

  const handleSecondsChange = async (seconds: number) => {
    if (!snap.selectedQuestion) return;
    await questionsValt.updateQuestion(snap.selectedQuestion.id, { seconds });
  };

  return (
    <fieldset className='fieldset bg-base-300 border-neutral rounded-box border p-4 mb-6'>
      <div className='grid grid-cols-3 gap-4'>
        {/* Question Type */}
        <div>
          <label className='label'>
            <span className='label-text font-semibold'>Question Type</span>
          </label>
          <select
            className='select select-bordered w-full'
            value={snap.selectedQuestion.type}
            onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
          >
            {QUESTION_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Max Points */}
        <div>
          <label className='label'>
            <span className='label-text font-semibold'>Max Points</span>
          </label>
          <input
            type='number'
            className='input input-bordered w-full'
            min='1'
            value={snap.selectedQuestion.maxPoints}
            onChange={(e) => handleMaxPointsChange(Number(e.target.value))}
          />
        </div>

        {/* Seconds */}
        <div>
          <label className='label'>
            <span className='label-text font-semibold'>Seconds</span>
          </label>
          <input
            type='number'
            className='input input-bordered w-full'
            min='1'
            value={snap.selectedQuestion.seconds}
            onChange={(e) => handleSecondsChange(Number(e.target.value))}
          />
        </div>
      </div>
    </fieldset>
  );
});

QuestionMetadata.displayName = 'QuestionMetadata';
