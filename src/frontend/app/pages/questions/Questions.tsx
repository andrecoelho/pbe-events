import { alertModal } from '@/frontend/components/AlertModal';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { memo, useMemo, useRef } from 'react';
import { useSnapshot } from 'valtio';
import { QuestionEditor } from './QuestionEditor';
import './Questions.css';
import { QuestionsList } from './QuestionsList';
import { QuestionsValt, QuestionsValtContext } from './questionsValt';

const init = () => {
  const valt = new QuestionsValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/questions\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    valt.init(eventId).then((result) => {
      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    });
  }

  return { valt };
};

export const Questions = memo(() => {
  const { valt } = useMemo(init, []);
  const snap = useSnapshot(valt.store);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddQuestion = async () => {
    await valt.addQuestion('PG', 1, 30);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    const confirmed =
      Object.entries(valt.store.questions).length === 0
        ? true
        : await confirmModal.open(
            'Importing questions will replace all existing questions in this event. Are you sure you want to continue?'
          );

    if (confirmed) {
      const result = await valt.importQuestions(file);

      if (result.error) {
        alertModal.open(`Error importing questions: ${result.error}`);
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    await valt.exportQuestions();
  };

  return (
    <QuestionsValtContext.Provider value={valt}>
      <div className='Questions bg-base-100/95 flex-1 relative flex flex-col overflow-hidden'>
        <div className='flex-none p-8 pb-1'>
          <h1 className='text-3xl font-bold mb-1 text-center'>Event Questions</h1>
          <h2 className='text-2xl font-bold text-center text-neutral brightness-75'>{snap.eventName}</h2>
        </div>
        <div className='flex-1 overflow-hidden px-8 pb-8 flex flex-col'>
          {valt.store.initialized && Object.keys(snap.languages).length === 0 && (
            <div className='flex-1 flex items-center justify-center'>
              <div className='text-center'>
                <p className='text-neutral-500 text-lg mb-4'>
                  No languages configured for this event. Please add languages before creating questions.
                </p>
                <a href={`/languages/${snap.eventId}`} className='btn btn-primary'>
                  <Icon name='language' className='size-4' />
                  Configure Languages
                </a>
              </div>
            </div>
          )}

          {Object.keys(snap.languages).length > 0 && Object.keys(snap.questions).length === 0 && (
            <div className='text-center py-8'>
              <p className='text-neutral mb-4'>No questions yet. Add your first question to get started.</p>
            </div>
          )}

          {Object.keys(snap.languages).length > 0 && Object.keys(snap.questions).length > 0 && (
            <div className='QuestionsEditor flex gap-6 flex-1 min-h-0'>
              {/* Question Numbers Column */}
              <QuestionsList />

              {/* Question Editor */}
              <QuestionEditor />
            </div>
          )}
        </div>

        <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end gap-4 shadow-md-top'>
          <input ref={fileInputRef} type='file' accept='.yaml,.yml' onChange={handleFileChange} className='hidden' />
          <button className='btn btn-secondary' disabled={!valt.store.initialized} onClick={handleImportClick}>
            <Icon name='arrow-down-tray' className='size-4' />
            Import
          </button>
          <button className='btn btn-accent' onClick={handleExport} disabled={Object.keys(snap.questions).length === 0}>
            <Icon name='arrow-up-tray' className='size-4' />
            Export
          </button>

          <button
            className='btn btn-primary'
            onClick={handleAddQuestion}
            disabled={!valt.store.initialized || Object.keys(snap.languages).length === 0}
          >
            <Icon name='plus' className='size-4' />
            Add Question
          </button>
        </footer>
      </div>
    </QuestionsValtContext.Provider>
  );
});

Questions.displayName = 'Questions';
