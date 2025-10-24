import { memo } from 'react';
import type { Snapshot } from 'valtio';
import { useQuestionsValt, type Question, type QuestionType } from './questionsValt';

const QUESTION_TYPES = [
  { value: 'PG', label: 'Points General' },
  { value: 'PS', label: 'Points Specific' },
  { value: 'TF', label: 'True/False' },
  { value: 'FB', label: 'Fill in the Blank' }
];

interface QuestionMetadataProps {
  question: Snapshot<Question>;
}

export const QuestionMetadata = memo(({ question }: QuestionMetadataProps) => {
  const questionsValt = useQuestionsValt();

  const handleQuestionTypeChange = async (type: QuestionType) => {
    await questionsValt.updateQuestion(question, { type });
  };

  const handleMaxPointsChange = async (maxPoints: number) => {
    await questionsValt.updateQuestion(question, { maxPoints });
  };

  const handleSecondsChange = async (seconds: number) => {
    await questionsValt.updateQuestion(question, { seconds });
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
            value={question.type}
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
            value={question.maxPoints}
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
            value={question.seconds}
            onChange={(e) => handleSecondsChange(Number(e.target.value))}
          />
        </div>
      </div>
    </fieldset>
  );
});

QuestionMetadata.displayName = 'QuestionMetadata';
