import './Questions.css';

import { QuestionsValt, QuestionsValtContext } from '@/frontend/app/pages/questions/questionsValt';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { Loading } from '@/frontend/components/Loading';
import { memo, useMemo, useRef } from 'react';
import { useSnapshot } from 'valtio';
import { QuestionEditor } from './QuestionEditor';
import { QuestionsList } from './QuestionsList';
import { alertModal } from '@/frontend/components/AlertModal';

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

export const Questions = memo(() => {
  const { questionsValt } = useMemo(init, []);
  const snap = useSnapshot(questionsValt.store);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!snap.initialized) {
    return <Loading backgroundColor='bg-base-100' indicatorColor='bg-primary' />;
  }

  const handleAddQuestion = async () => {
    await questionsValt.addQuestion('PG', 1, 30);
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
      Object.entries(questionsValt.store.questions).length === 0
        ? true
        : await confirmModal.open(
            'Importing questions will replace all existing questions in this event. Are you sure you want to continue?'
          );

    if (confirmed) {
      const result = await questionsValt.importQuestions(file);

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
    await questionsValt.exportQuestions();
  };

  return (
    <QuestionsValtContext.Provider value={questionsValt}>
      <div className='Questions bg-base-100 flex-1 relative flex flex-col overflow-hidden'>
        <div className='flex-none p-8 pb-4'>
          <h1 className='text-3xl font-bold mb-1 text-center'>Event Questions</h1>
          <h2 className='text-2xl font-bold mb-6 text-center text-neutral brightness-75'>{snap.eventName}</h2>
        </div>
        <div className='flex-1 overflow-hidden px-8 pb-8 flex flex-col'>
          {Object.keys(snap.questions).length === 0 && (
            <div className='text-center py-8'>
              <p className='text-neutral mb-4'>No questions yet. Add your first question to get started.</p>
            </div>
          )}

          {Object.keys(snap.questions).length > 0 && (
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
          <button className='btn btn-secondary' onClick={handleImportClick}>
            <Icon name='arrow-down-tray' className='size-4' />
            Import
          </button>
          <button className='btn btn-accent' onClick={handleExport} disabled={Object.keys(snap.questions).length === 0}>
            <Icon name='arrow-up-tray' className='size-4' />
            Export
          </button>

          <button className='btn btn-primary' onClick={handleAddQuestion}>
            <Icon name='plus' className='size-4' />
            Add Question
          </button>
        </footer>
      </div>
    </QuestionsValtContext.Provider>
  );
});

Questions.displayName = 'Questions';
