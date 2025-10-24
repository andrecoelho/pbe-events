import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { memo } from 'react';
import { type Snapshot } from 'valtio';
import { useQuestionsValt, type Question } from './questionsValt';

interface QuestionListItemProps {
  question: Snapshot<Question>;
  isSelected: boolean;
  isFirst: boolean;
}

export const QuestionListItem = memo(({ question, isSelected, isFirst }: QuestionListItemProps) => {
  const questionsValt = useQuestionsValt();

  const handleInsertBefore = async () => {
    await questionsValt.insertQuestionBefore(question.number, 'PG', 1, 30);
  };

  const handleDelete = async () => {
    const confirmed = await confirmModal.open(
      `Are you sure you want to delete question ${question.number}? This action cannot be undone.`
    );

    if (confirmed) {
      await questionsValt.deleteQuestion(question);
    }
  };

  const handleSelect = () => {
    questionsValt.setSelectedQuestion(question.number);
  };

  return (
    <div>
      {/* Divider to insert question before */}
      {!isFirst && (
        <div
          className='h-[3px] my-2 cursor-pointer bg-transparent hover:bg-neutral transition-colors'
          onClick={handleInsertBefore}
          title={`Insert question before ${question.number}`}
        />
      )}

      {/* Question button */}
      <div
        className={`group relative flex items-center justify-center rounded-md shadow-md ${
          isSelected ? 'bg-accent/30 hover:bg-accent/40' : 'bg-primary/10 hover:bg-primary/20'
        }`}
      >
        <button className={`QuestionNumber ${isSelected ? 'active' : ''}`} onClick={handleSelect}>
          {question.number}
        </button>

        {/* Delete button - visible on hover */}
        <button
          className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-error/20 cursor-pointer'
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          title='Delete question'
        >
          <Icon name='trash' className='size-3 text-error' />
        </button>
      </div>
    </div>
  );
});

QuestionListItem.displayName = 'QuestionListItem';
