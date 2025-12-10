import { GradeValt } from '@/frontend/app/pages/grade/gradeValt';
import { Icon } from '@/frontend/components/Icon';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Grade.css';

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

  const handlePointsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');
    const value = event.currentTarget.value;

    if (teamId && questionId) {
      gradeValt.updatePoints(questionId, teamId, value === '' ? null : Number(value));
    }
  };

  const handleGiveMaxPoints = (event: React.MouseEvent<HTMLButtonElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');

    if (teamId && questionId) {
      gradeValt.giveMaxPoints(questionId, teamId);
    }
  };

  const handleGiveZeroPoints = (event: React.MouseEvent<HTMLButtonElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');

    if (teamId && questionId) {
      gradeValt.giveZeroPoints(questionId, teamId);
    }
  };

  return {
    gradeValt,
    handleSelectQuestion,
    handleSelectNextQuestion,
    handleSelectPreviousQuestion,
    handlePointsChange,
    handleGiveMaxPoints,
    handleGiveZeroPoints
  };
};

export const Grade = () => {
  const {
    gradeValt,
    handleSelectQuestion,
    handleSelectNextQuestion,
    handleSelectPreviousQuestion,
    handlePointsChange,
    handleGiveMaxPoints,
    handleGiveZeroPoints
  } = useMemo(init, []);
  const snap = useSnapshot(gradeValt.store);

  const selectedQuestion = snap.selectedQuestionId
    ? snap.questions.find((q) => q.id === snap.selectedQuestionId) || null
    : null;

  const runStatusConfig = {
    not_started: { label: 'Not Started', color: 'badge-neutral' },
    in_progress: { label: 'In Progress', color: 'badge-info' },
    paused: { label: 'Paused', color: 'badge-warning' },
    completed: { label: 'Completed', color: 'badge-success' }
  };

  const statusInfo = runStatusConfig[snap.runStatus] || { label: snap.runStatus, color: 'badge-neutral' };

  useEffect(() => () => gradeValt.cleanup(), [gradeValt]);

  return (
    <div className='Grade bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8 pt-4 place-items-center'>
        <h1 className='text-3xl font-bold mb-1 text-center'>
          Grade &nbsp;
          <span className='text-neutral brightness-75'>{snap.eventName}</span>
        </h1>

        <div className='flex w-full h-[calc(100%-24px)]'>
          <div className='flex-none flex flex-col flex-wrap gap-1 p-2'>
            {snap.questions.map((question) => {
              const isActive = snap.activeItem?.type === 'question' && snap.activeItem.id === question.id;
              const isSelected = snap.selectedQuestionId === question.id;

              return (
                <div
                  key={question.id}
                  tabIndex={0}
                  className={`question-badge ${
                    isSelected ? 'question-badge--selected' : isActive ? 'question-badge--active' : ''
                  }`}
                  data-question-id={question.id}
                  onClick={handleSelectQuestion}
                >
                  {question.number}
                </div>
              );
            })}
          </div>

          {!selectedQuestion && (
            <div className='flex-2 flex justify-center items-center text-xl'>Select a question to grade</div>
          )}

          {selectedQuestion && (
            <div className='flex-2 pl-4'>
              <div className='text-2xl font-bold'>
                <span>Question #{selectedQuestion.number}</span>
                &nbsp;
                <span className='text-base-content/50'>
                  ({selectedQuestion.maxPoints} pts. {selectedQuestion.seconds} secs.)
                </span>
              </div>
              {selectedQuestion.translations.map((translation) => (
                <fieldset
                  key={translation.languageCode}
                  className='fieldset bg-neutral/30 border-neutral-400 rounded-lg border mt-2 p-2 text-sm'
                >
                  <legend className='fieldset-legend'>
                    {translation.languageName} ({translation.languageCode.toUpperCase()})
                  </legend>
                  <div>{translation.prompt}</div>
                  <div className='border-t-1 border-dashed border-neutral-400 mt-2'>
                    <span className='font-extralight'>Answer:</span>
                    &nbsp;
                    {translation.answer}
                    &nbsp;
                    {translation.clarification ? `(${translation.clarification})` : ''}
                  </div>
                </fieldset>
              ))}

              <div className='mt-4'>
                <h3 className='text-lg font-semibold mb-2'>Team Answers</h3>
                <table className='table table-zebra w-full'>
                  <thead>
                    <tr>
                      <th>Team #</th>
                      <th>Language</th>
                      <th>Answer</th>
                      <th>Points</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selectedQuestion.answers).map(([key, answer]) => (
                      <tr key={key}>
                        <td>{answer.teamNumber}</td>
                        <td className='font-mono text-xs'>{answer.languageCode?.toUpperCase() || ''}</td>
                        <td className='font-mono text-sm'>{answer.answerText}</td>
                        <td>
                          {answer.answerId && (
                            <input
                              type='number'
                              className='input input-sm input-bordered w-20'
                              value={answer.points ?? ''}
                              data-team-id={answer.teamId}
                              data-question-id={selectedQuestion.id}
                              onChange={handlePointsChange}
                              min='0'
                              max={selectedQuestion.maxPoints}
                            />
                          )}
                        </td>
                        <td className='flex gap-2'>
                          {answer.answerId && (
                            <button
                              className='tooltip tooltip-neutral'
                              data-tip='Mark Answer as Correct'
                              data-team-id={answer.teamId}
                              data-question-id={selectedQuestion.id}
                              onClick={handleGiveMaxPoints}
                              aria-label='Mark Answer as Correct'
                            >
                              <Icon
                                name='hand-thumb-up'
                                className='size-6 cursor-pointer text-success hover:brightness-150'
                              />
                            </button>
                          )}
                          {answer.answerId && (
                            <button
                              className='tooltip tooltip-neutral'
                              data-tip='Mark Answer as Incorrect'
                              data-team-id={answer.teamId}
                              data-question-id={selectedQuestion.id}
                              onClick={handleGiveZeroPoints}
                              aria-label='Mark Answer as Incorrect'
                            >
                              <Icon
                                name='hand-thumb-down'
                                className='size-6 cursor-pointer text-error hover:brightness-150'
                              />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between items-center shadow-md-top'>
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
        <span className={`badge ${statusInfo.color} ml-6`}>{statusInfo.label}</span>
      </footer>
    </div>
  );
};

Grade.displayName = 'Grade';
