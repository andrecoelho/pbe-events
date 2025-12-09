import { GradeValt } from '@/frontend/app/pages/grade/gradeValt';
import { Icon } from '@/frontend/components/Icon';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';

const init = () => {
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/grade\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;
  const gradeValt = new GradeValt();

  if (eventId) {
    gradeValt.init(eventId);
  }

  const handleSelectQuestion = (event: React.MouseEvent<HTMLDivElement>) => {
    const questionId = event.currentTarget.getAttribute('data-question-id');

    if (questionId) {
      gradeValt.selectQuestion(questionId);
    }
  };

  const handleSelectNextQuestion = () => {
    gradeValt.selectNextQuestion();
  };

  const handleSelectPreviousQuestion = () => {
    gradeValt.selectPreviousQuestion();
  };

  return { gradeValt, handleSelectQuestion, handleSelectNextQuestion, handleSelectPreviousQuestion };
};

export const Grade = () => {
  const { gradeValt, handleSelectQuestion, handleSelectNextQuestion, handleSelectPreviousQuestion } = useMemo(init, []);
  const snap = useSnapshot(gradeValt.store);

  const selectedQuestion = snap.selectedQuestionId
    ? snap.questions.find((q) => q.id === snap.selectedQuestionId) || null
    : null;

  useEffect(() => () => gradeValt.cleanup(), [gradeValt]);

  return (
    <div className='bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8 pt-4 place-items-center'>
        <h1 className='text-3xl font-bold mb-1 text-center'>
          Grade Event &nbsp;
          <span className='text-neutral brightness-75'>{snap.eventName}</span>
        </h1>

        <div className='flex w-full h-[calc(100%-24px)]'>
          <div className='bg-neutral/30 flex-none flex flex-col flex-wrap gap-1 p-2'>
            {snap.questions.map((question) => (
              <div
                key={question.id}
                className={`size-10 border-2 flex justify-center items-center cursor-pointer hover:border-secondary ${
                  snap.selectedQuestionId === question.id ? 'bg-blue-200' : ''
                }`}
                data-question-id={question.id}
                onClick={handleSelectQuestion}
              >
                {question.number}
              </div>
            ))}
          </div>

          {!selectedQuestion && (
            <div className='flex-2 flex justify-center items-center text-xl'>Select a question to grade</div>
          )}

          {selectedQuestion && (
            <div className='flex-2 pl-4'>
              <div className='text-2xl font-bold'>Question #{selectedQuestion.number}</div>
              {selectedQuestion.translations.map((translation) => (
                <div key={translation.languageCode} className='mt-2 border-1 border-neutral-400 p-2 rounded-lg'>
                  <div className='font-bold'>
                    {translation.languageName} ({translation.languageCode}):
                  </div>
                  <div>{translation.prompt}</div>
                  <div className='border-t-1 border-dashed border-neutral-400 mt-2'>
                    <span className='font-medium'>Answer:</span> {translation.answer}{' '}
                    {translation.clarification ? `(${translation.clarification})` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between shadow-md-top'>
        <div className='flex gap-2'>
          <button className='btn btn-neutral' onClick={handleSelectPreviousQuestion}>
            <Icon name='chevron-left' className='size-4' />
            Previous
          </button>
          <button className='btn btn-neutral' onClick={handleSelectNextQuestion}>
            <Icon name='chevron-right' className='size-4' />
            Next
          </button>
        </div>
      </footer>
    </div>
  );
};

Grade.displayName = 'Grade';
