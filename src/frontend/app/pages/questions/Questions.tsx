import './Questions.css';

import { QuestionsValt, type QuestionType } from '@/frontend/app/pages/questions/questionsValt';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { Loading } from '@/frontend/components/Loading';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSnapshot } from 'valtio';

const QUESTION_TYPE_OPTIONS = [
  { value: 'PS', label: 'Points Specific' },
  { value: 'PW', label: 'Points per Word' },
  { value: 'TF', label: 'True/False' },
  { value: 'FB', label: 'Fill in the Blank' }
];

const init = () => {
  const questionsValt = new QuestionsValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/questions\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    questionsValt.init(eventId);
  }

  return { questionsValt };
};

export function Questions() {
  const { questionsValt } = useMemo(init, []);
  const snap = useSnapshot(questionsValt.store);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!snap.initialized) {
    return <Loading backgroundColor='bg-base-100' indicatorColor='bg-primary' />;
  }

  const selectedQuestion = snap.questions.find((q) => q.number === snap.selectedQuestionNumber);

  const handleAddQuestion = async () => {
    await questionsValt.createQuestion('PS', 10, 30);
    // Selection is handled in valt
  };

  const handleInsertBefore = async (beforeNumber: number) => {
    await questionsValt.insertQuestionBefore(beforeNumber, 'PS', 10, 30);
    // Selection is handled in valt
  };

  const handleDeleteQuestion = async (questionNumber: number) => {
    const question = snap.questions.find((q) => q.number === questionNumber);
    if (!question) return;

    const confirmed = await confirmModal.open(
      `Are you sure you want to delete question ${questionNumber}? This action cannot be undone.`
    );

    if (confirmed) {
      await questionsValt.deleteQuestion(question.id);
      // Selection is handled in valt
    }
  };

  const handleQuestionTypeChange = async (type: QuestionType) => {
    if (!selectedQuestion) return;
    await questionsValt.updateQuestion(selectedQuestion.id, { type });
  };

  const handleMaxPointsChange = async (maxPoints: number) => {
    if (!selectedQuestion) return;
    await questionsValt.updateQuestion(selectedQuestion.id, { maxPoints });
  };

  const handleSecondsChange = async (seconds: number) => {
    if (!selectedQuestion) return;
    await questionsValt.updateQuestion(selectedQuestion.id, { seconds });
  };

  const handleTranslationChange = async (languageCode: string, field: 'prompt' | 'answer', value: string) => {
    if (!selectedQuestion) return;

    const translation = selectedQuestion.translations.find((t) => t.languageCode === languageCode);

    if (translation) {
      const prompt = field === 'prompt' ? value : translation.prompt;
      const answer = field === 'answer' ? value : translation.answer;
      await questionsValt.upsertTranslation(selectedQuestion.id, languageCode, prompt, answer);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = await confirmModal.open(
      'Importing questions will replace all existing questions in this event. Are you sure you want to continue?'
    );

    if (confirmed) {
      await questionsValt.importQuestions(file);
      // Selection is handled in valt's init method
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    await questionsValt.exportQuestions();
  };

  return (
    <div className='Questions bg-base-100 flex-1 relative flex flex-col overflow-hidden'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Questions</h1>
        <h2 className='text-2xl font-bold mb-6 text-center text-neutral brightness-75'>{snap.eventName}</h2>

        {/* Import/Export Section */}
        <div className='ImportExport border border-base-300 rounded-lg p-4 mb-6'>
          <h3 className='text-lg font-semibold mb-3'>Import / Export Questions</h3>
          <div className='flex gap-4'>
            <button className='btn btn-secondary' onClick={handleImportClick}>
              <Icon name='arrow-down-tray' className='size-4' />
              Import
            </button>
            <button className='btn btn-secondary' onClick={handleExport} disabled={snap.questions.length === 0}>
              <Icon name='arrow-up-tray' className='size-4' />
              Export
            </button>
          </div>
          <input ref={fileInputRef} type='file' accept='.yaml,.yml' onChange={handleFileChange} className='hidden' />
        </div>

        {/* Questions List and Editor */}
        {snap.questions.length === 0 ? (
          <div className='text-center py-8'>
            <p className='text-neutral mb-4'>No questions yet. Add your first question to get started.</p>
          </div>
        ) : (
          <div className='QuestionsEditor flex gap-6'>
            {/* Question Numbers Column */}
            <div className='QuestionsList flex-shrink-0'>
              <div className='flex flex-col gap-2'>
                {snap.questions.map((question) => (
                  <div
                    key={question.id}
                    className='relative'
                    onMouseEnter={() => questionsValt.setHoveredQuestion(question.number)}
                    onMouseLeave={() => questionsValt.setHoveredQuestion(null)}
                  >
                    <button
                      className={`QuestionNumber ${snap.selectedQuestionNumber === question.number ? 'active' : ''}`}
                      onClick={() => questionsValt.setSelectedQuestion(question.number)}
                    >
                      {question.number}
                    </button>

                    {/* Hover Popover */}
                    {snap.hoveredQuestionNumber === question.number && (
                      <div className='QuestionActions'>
                        <button
                          className='btn btn-xs btn-secondary'
                          onClick={() => handleInsertBefore(question.number)}
                        >
                          <Icon name='plus' className='size-3' />
                          Insert Before
                        </button>
                        <button
                          className='btn btn-xs btn-error'
                          onClick={() => handleDeleteQuestion(question.number)}
                        >
                          <Icon name='trash' className='size-3' />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Question Editor */}
            {selectedQuestion && (
              <div className='QuestionEditor flex-1'>
                <h3 className='text-xl font-bold mb-4'>Question {selectedQuestion.number}</h3>

                {/* Question Metadata Section */}
                <div className='QuestionMetadata border border-base-300 rounded-lg p-4 mb-6'>
                  <div className='grid grid-cols-3 gap-4'>
                    {/* Question Type */}
                    <div>
                      <label className='label'>
                        <span className='label-text font-semibold'>Question Type</span>
                      </label>
                      <select
                        className='select select-bordered w-full'
                        value={selectedQuestion.type}
                        onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
                      >
                        {QUESTION_TYPE_OPTIONS.map((option) => (
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
                        value={selectedQuestion.maxPoints}
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
                        value={selectedQuestion.seconds}
                        onChange={(e) => handleSecondsChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                {/* Translations Section */}
                <div className='QuestionTranslations'>
                  <h4 className='text-lg font-semibold mb-3'>Translations</h4>
                  <div className='flex flex-col gap-4'>
                    {snap.languages.map((language) => {
                      const translation = selectedQuestion.translations.find((t) => t.languageCode === language.code);
                      return (
                        <div key={language.code} className='Translation border border-base-300 rounded-lg p-4'>
                          <h5 className='font-semibold mb-3'>
                            {language.name} ({language.code})
                          </h5>
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
                                onChange={(e) =>
                                  handleTranslationChange(language.code, 'prompt', e.target.value)
                                }
                              />
                            </div>

                            {/* Answer */}
                            <div>
                              <label className='label'>
                                <span className='label-text'>Answer</span>
                              </label>
                              {selectedQuestion.type === 'TF' ? (
                                <select
                                  className='select select-bordered w-full'
                                  value={translation?.answer || ''}
                                  onChange={(e) => handleTranslationChange(language.code, 'answer', e.target.value)}
                                >
                                  <option value=''>Select answer...</option>
                                  <option value='true'>True</option>
                                  <option value='false'>False</option>
                                </select>
                              ) : (
                                <input
                                  type='text'
                                  className='input input-bordered w-full'
                                  placeholder='Enter the answer...'
                                  value={translation?.answer || ''}
                                  onChange={(e) => handleTranslationChange(language.code, 'answer', e.target.value)}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary' onClick={handleAddQuestion}>
          <Icon name='plus' className='size-4' />
          Add Question
        </button>
      </footer>
    </div>
  );
}

Questions.displayName = 'Questions';
