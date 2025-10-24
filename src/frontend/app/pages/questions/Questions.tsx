import './Questions.css';

import { QuestionsValt, type QuestionType } from '@/frontend/app/pages/questions/questionsValt';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { Loading } from '@/frontend/components/Loading';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSnapshot } from 'valtio';

const QUESTION_TYPES = [
  { value: 'PG', label: 'Points General' },
  { value: 'PS', label: 'Points Specific' },
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
    // Recheck when questions change
  }, [snap.questions.length]);

  if (!snap.initialized) {
    return <Loading backgroundColor='bg-base-100' indicatorColor='bg-primary' />;
  }

  const selectedQuestion = snap.questions.find((q) => q.number === snap.selectedQuestionNumber);

  const handleAddQuestion = async () => {
    await questionsValt.createQuestion('PG', 1, 30);
  };

  const handleInsertQuestionBefore = async (beforeNumber: number) => {
    await questionsValt.insertQuestionBefore(beforeNumber, 'PG', 1, 30);
  };

  const handleDeleteQuestion = async (questionNumber: number) => {
    const question = snap.questions.find((q) => q.number === questionNumber);
    if (!question) return;

    const confirmed = await confirmModal.open(
      `Are you sure you want to delete question ${questionNumber}? This action cannot be undone.`
    );

    if (confirmed) {
      await questionsValt.deleteQuestion(question.id);
    }
  };

  const handleQuestionTypeChange = async (type: QuestionType) => {
    if (!selectedQuestion) {
      return;
    }

    await questionsValt.updateQuestion(selectedQuestion.id, { type });
  };

  const handleMaxPointsChange = async (maxPoints: number) => {
    if (!selectedQuestion) {
      return;
    }

    await questionsValt.updateQuestion(selectedQuestion.id, { maxPoints });
  };

  const handleSecondsChange = async (seconds: number) => {
    if (!selectedQuestion) {
      return;
    }

    await questionsValt.updateQuestion(selectedQuestion.id, { seconds });
  };

  const handleTranslationChange = async (languageCode: string, field: 'prompt' | 'answer', value: string) => {
    if (!selectedQuestion) {
      return;
    }

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
      <div className='flex-none p-8 pb-4'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Questions</h1>
        <h2 className='text-2xl font-bold mb-6 text-center text-neutral brightness-75'>{snap.eventName}</h2>
      </div>
      <div className='flex-1 overflow-hidden px-8 pb-8 flex flex-col'>
        {snap.questions.length === 0 && (
          <div className='text-center py-8'>
            <p className='text-neutral mb-4'>No questions yet. Add your first question to get started.</p>
          </div>
        )}

        {snap.questions.length > 0 && (
          <div className='QuestionsEditor flex gap-6 flex-1 min-h-0'>
            {/* Question Numbers Column */}
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
                  <div key={question.id}>
                    {/* Divider to insert question before */}
                    {index > 0 && (
                      <div
                        className='h-[3px] my-2 cursor-pointer bg-transparent hover:bg-neutral transition-colors'
                        onClick={() => handleInsertQuestionBefore(question.number)}
                        title={`Insert question before ${question.number}`}
                      />
                    )}

                    {/* Question button */}
                    <div
                      className={`group relative flex items-center justify-center rounded-md shadow-md ${
                        snap.selectedQuestionNumber === question.number
                          ? 'bg-accent/30 hover:bg-accent/40'
                          : 'bg-primary/10 hover:bg-primary/20'
                      }`}
                    >
                      <button
                        className={`QuestionNumber ${snap.selectedQuestionNumber === question.number ? 'active' : ''}`}
                        onClick={() => questionsValt.setSelectedQuestion(question.number)}
                      >
                        {question.number}
                      </button>

                      {/* Delete button - visible on hover */}
                      <button
                        className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-error/20 cursor-pointer'
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuestion(question.number);
                        }}
                        title='Delete question'
                      >
                        <Icon name='trash' className='size-3 text-error' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Question Editor */}
            {selectedQuestion && (
              <div className='QuestionEditor flex-1 overflow-y-auto h-full'>
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
                                onChange={(e) => handleTranslationChange(language.code, 'prompt', e.target.value)}
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

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end gap-4 shadow-md-top'>
        <input ref={fileInputRef} type='file' accept='.yaml,.yml' onChange={handleFileChange} className='hidden' />
        <button className='btn btn-secondary' onClick={handleImportClick}>
          <Icon name='arrow-down-tray' className='size-4' />
          Import
        </button>
        <button className='btn btn-accent' onClick={handleExport} disabled={snap.questions.length === 0}>
          <Icon name='arrow-up-tray' className='size-4' />
          Export
        </button>

        <button className='btn btn-primary' onClick={handleAddQuestion}>
          <Icon name='plus' className='size-4' />
          Add Question
        </button>
      </footer>
    </div>
  );
}

Questions.displayName = 'Questions';
