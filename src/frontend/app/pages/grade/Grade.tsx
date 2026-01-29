import { GradeValt } from '@/frontend/app/pages/grade/gradeValt';
import { Icon } from '@/frontend/components/Icon';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Grade.css';
import { toast } from '@/frontend/components/Toast';

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

  const handlePointsChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');
    const value = event.currentTarget.value;

    if (teamId && questionId) {
      const result = await gradeValt.updatePoints(questionId, teamId, value === '' ? null : parseInt(value));

      if (!result) {
        toast.show({ type: 'error', message: 'Failed to update points.' });
      }
    }
  };

  const handleGiveMaxPoints = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');

    if (teamId && questionId) {
      const result = await gradeValt.giveMaxPoints(questionId, teamId);

      if (!result) {
        toast.show({ type: 'error', message: 'Failed to update points.' });
      }
    }
  };

  const handleGiveZeroPoints = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');

    if (teamId && questionId) {
      const result = await gradeValt.giveZeroPoints(questionId, teamId);

      if (!result) {
        toast.show({ type: 'error', message: 'Failed to update points.' });
      }
    }
  };

  const handleClearPoints = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const teamId = event.currentTarget.getAttribute('data-team-id');
    const questionId = event.currentTarget.getAttribute('data-question-id');

    if (teamId && questionId) {
      const result = await gradeValt.updatePoints(questionId, teamId, null);

      if (!result) {
        toast.show({ type: 'error', message: 'Failed to update points.' });
      }
    }
  };

  const handleMarkQuestionAsGraded = async () => {
    if (gradeValt.store.selectedQuestion) {
      gradeValt.setQuestionGraded(gradeValt.store.selectedQuestion.id, true);
    }
  };

  const handleMarkQuestionAsNotGraded = async () => {
    if (gradeValt.store.selectedQuestion) {
      gradeValt.setQuestionGraded(gradeValt.store.selectedQuestion.id, false);
    }
  };

  const handleReconnect = () => {
    gradeValt.connect();
  };

  return {
    gradeValt,
    handleSelectQuestion,
    handleSelectNextQuestion,
    handleSelectPreviousQuestion,
    handlePointsChange,
    handleGiveMaxPoints,
    handleGiveZeroPoints,
    handleClearPoints,
    handleMarkQuestionAsGraded,
    handleMarkQuestionAsNotGraded,
    handleReconnect
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
    handleGiveZeroPoints,
    handleClearPoints,
    handleMarkQuestionAsGraded,
    handleMarkQuestionAsNotGraded,
    handleReconnect
  } = useMemo(init, []);

  const snap = useSnapshot(gradeValt.store, { sync: true });

  const selectedQuestion = snap.selectedQuestion;

  const runStatusConfig = {
    not_started: { label: 'Not Started', color: 'badge-neutral' },
    in_progress: { label: 'In Progress', color: 'badge-info' },
    paused: { label: 'Paused', color: 'badge-warning' },
    completed: { label: 'Completed', color: 'badge-success' }
  };

  const statusInfo = runStatusConfig[snap.runStatus] || { label: snap.runStatus, color: 'badge-neutral' };
  const readyToGrade = snap.connectionState === 'connected' && selectedQuestion?.locked;
  const editDisabled = !readyToGrade || selectedQuestion?.graded;

  useEffect(() => gradeValt.cleanup, [gradeValt]);

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
              const isSelected = snap.selectedQuestion?.id === question.id;

              return (
                <div
                  key={question.id}
                  tabIndex={0}
                  className={`question-badge ${
                    question.graded && isActive
                      ? 'question-badge--active-graded'
                      : question.locked && isActive
                        ? 'question-badge--active-locked'
                        : isActive
                          ? 'question-badge--active'
                          : question.graded
                            ? 'question-badge--graded'
                            : question.locked
                              ? 'question-badge--locked'
                              : ''
                  } ${isSelected ? 'question-badge--selected' : ''}`}
                  data-question-id={question.id}
                  onClick={handleSelectQuestion}
                >
                  {question.number}
                </div>
              );
            })}
          </div>

          {snap.initialized && snap.questions.length === 0 && (
            <div className='flex-1 flex items-center justify-center'>
              <div className='text-center'>
                <p className='text-neutral-500 text-lg mb-4'>
                  There are no questions in this event. Please add questions before grading.
                </p>
                <a href={`/questions/${snap.eventId}`} className='btn btn-primary'>
                  <Icon name='light-bulb' className='size-4' />
                  Configure Questions
                </a>
              </div>
            </div>
          )}

          {snap.initialized && selectedQuestion && (
            <div className='flex-2 pl-4'>
              <div className='text-2xl font-bold flex justify-between'>
                <span>Question #{selectedQuestion.number}</span>
                <div className='flex gap-4'>
                  <span className='badge badge-xl bg-neutral/50 text-base-content/80'>
                    {selectedQuestion.maxPoints} pts.
                  </span>
                  <span className='badge badge-xl bg-neutral/70 text-base-content/80'>
                    {selectedQuestion.seconds} secs.
                  </span>
                </div>
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
                  <div className='border-t-1 border-dashed border-neutral-400 mt-2 pt-2'>
                    <span className='font-extralight'>Answer:</span>
                    &nbsp;
                    <span className='badge bg-success/20'>
                      {translation.answer}
                      &nbsp;
                      {translation.clarification ? `(${translation.clarification})` : ''}
                    </span>
                  </div>
                </fieldset>
              ))}

              <div className={`mt-4 ${editDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <h3 className='text-lg font-semibold mb-2'>Team Answers</h3>
                <table className='table table-zebra w-full'>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className='text-center'>
                        <Icon name='face-frown' variant='solid' className='size-5 inline' />
                      </th>
                      <th className='text-center'>
                        <Icon name='language' className='size-5 inline' />
                      </th>
                      <th>Answer</th>
                      <th>Points</th>
                      <th className='text-center'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selectedQuestion.answers).map(([key, answer]) => (
                      <tr key={key}>
                        <td>{answer.teamNumber}</td>
                        <td className='text-center'>
                          {answer.challenged && <Icon name='face-frown' variant='solid' className='size-5 text-error inline' />}
                        </td>
                        <td className='font-mono text-xs text-center'>
                          {answer.languageCode && (
                            <span className='badge badge-neutral'>{answer.languageCode.toUpperCase()}</span>
                          )}
                        </td>
                        <td className='font-mono text-base'>{answer.answerText}</td>
                        <td>
                          {answer.answerId && (
                            <input
                              type='number'
                              disabled={editDisabled}
                              className='input input-sm input-bordered w-20 font-mono text-base'
                              value={answer.points ?? ''}
                              data-team-id={answer.teamId}
                              data-question-id={selectedQuestion.id}
                              onChange={handlePointsChange}
                              min='0'
                              max={selectedQuestion.maxPoints}
                            />
                          )}
                        </td>
                        <td className='flex gap-2 justify-center'>
                          {answer.answerId && (
                            <button
                              className='tooltip tooltip-neutral'
                              data-tip='Mark Answer as Correct'
                              data-team-id={answer.teamId}
                              data-question-id={selectedQuestion.id}
                              disabled={editDisabled}
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
                              disabled={editDisabled}
                              onClick={handleGiveZeroPoints}
                              aria-label='Mark Answer as Incorrect'
                            >
                              <Icon
                                name='hand-thumb-down'
                                className='size-6 cursor-pointer text-error hover:brightness-150'
                              />
                            </button>
                          )}
                          {answer.answerId && (
                            <button
                              className='tooltip tooltip-neutral'
                              data-tip='Clear Points'
                              data-team-id={answer.teamId}
                              data-question-id={selectedQuestion.id}
                              disabled={editDisabled}
                              onClick={handleClearPoints}
                              aria-label='Clear Points'
                            >
                              <Icon
                                name='x-circle'
                                className='size-6 cursor-pointer text-amber-600 hover:brightness-150'
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

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between items-center shadow-md-top z-1'>
        <div className='flex gap-2 items-center'>
          <button
            className='btn btn-neutral'
            disabled={snap.connectionState !== 'connected'}
            onClick={handleSelectPreviousQuestion}
          >
            <Icon name='chevron-left' className='size-4' />
            Previous
          </button>

          <button
            className='btn btn-neutral'
            disabled={snap.connectionState !== 'connected'}
            onClick={handleSelectNextQuestion}
          >
            Next
            <Icon name='chevron-right' className='size-4' />
          </button>
        </div>

        {snap.connectionState === 'connecting' && (
          <span className='alert alert-info w-lg'>
            <Icon name='information-circle' className='size-5' />
            Connecting to event &hellip;
          </span>
        )}

        {snap.connectionState === 'error' && (
          <span className='alert alert-error w-lg'>
            <Icon name='x-circle' className='size-5' />
            Connection error.
            <button className='btn btn-primary btn-xs' onClick={handleReconnect}>
              <Icon name='arrow-path' className='size-3' />
              Reconnect
            </button>
          </span>
        )}

        {snap.connectionState === 'offline' && (
          <span className='alert alert-warning w-lg'>
            <Icon name='exclamation-triangle' className='size-5' />
            Your internet is down.
          </span>
        )}

        {snap.connectionState === 'connected' && (
          <span className={`badge ${statusInfo.color} ml-6`}>{statusInfo.label}</span>
        )}

        <div>
          {!selectedQuestion?.graded && (
            <button className='btn btn-success' disabled={!readyToGrade} onClick={handleMarkQuestionAsGraded}>
              <Icon name='academic-cap' className='size-4' />
              Mark as Graded
            </button>
          )}
          {selectedQuestion?.graded && (
            <button className='btn btn-accent' disabled={!readyToGrade} onClick={handleMarkQuestionAsNotGraded}>
              <Icon name='arrow-path' className='size-4' />
              Reset Graded Status
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

Grade.displayName = 'Grade';
