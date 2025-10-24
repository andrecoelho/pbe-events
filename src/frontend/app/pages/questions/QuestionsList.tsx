import { useEffect, useRef, useState, memo } from 'react';
import { useSnapshot } from 'valtio';
import { QuestionListItem } from './QuestionListItem';
import { useQuestionsValt } from './questionsValt';

export const QuestionsList = memo(() => {
  const questionsValt = useQuestionsValt();
  const snap = useSnapshot(questionsValt.store);
  const questionsListRef = useRef<HTMLDivElement>(null);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const [showTopShadow, setShowTopShadow] = useState(false);

  const checkScrollShadow = () => {
    const element = questionsListRef.current;
    if (!element) return;

    const hasScroll = element.scrollHeight > element.clientHeight;
    const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 1;
    const isScrolled = element.scrollTop > 0;

    setShowBottomShadow(hasScroll && !isAtBottom);
    setShowTopShadow(isScrolled);
  };

  useEffect(() => {
    checkScrollShadow();
  }, [snap.questions.length]);

  return (
    <div
      ref={questionsListRef}
      className='QuestionsList flex-none overflow-y-auto h-full relative'
      onScroll={checkScrollShadow}
      style={{
        boxShadow:
          [
            showTopShadow ? 'inset 0 8px 8px -8px rgba(0, 0, 0, 0.2)' : '',
            showBottomShadow ? 'inset 0 -8px 8px -8px rgba(0, 0, 0, 0.2)' : ''
          ]
            .filter(Boolean)
            .join(', ') || 'none'
      }}
    >
      <div className='flex flex-col gap-0 p-4'>
        {snap.questions.map((question, index) => (
          <QuestionListItem
            key={question.id}
            questionId={question.id}
            questionNumber={question.number}
            isSelected={snap.selectedQuestion?.number === question.number}
            isFirst={index === 0}
          />
        ))}
      </div>
    </div>
  );
});

QuestionsList.displayName = 'QuestionsList';
