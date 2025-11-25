import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useMemo, useState } from 'react';
import { useSnapshot } from 'valtio';
import { LanguageRow } from './LanguageRow';
import './Languages.css';
import { LanguagesValt } from './languagesValt';

const init = () => {
  const valt = new LanguagesValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/languages\/([^/]+)$/);
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

export function Languages() {
  const { valt } = useMemo(init, []);
  const snap = useSnapshot(valt.store);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className='Languages bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Languages</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
        <div className='grid grid-cols-[120px_1fr_140px] text-sm w-[800px] self-center'>
          {/* Header */}
          <div className='col-code col-header font-bold'>Code</div>
          <div className='col-name col-header font-bold'>Name</div>
          <div className='col-actions col-header font-bold'>Actions</div>

          {/* Language Rows */}
          {snap.languages.map((language) => (
            <LanguageRow key={language.id} language={language} valt={valt} />
          ))}

          {/* Add Row */}
          {isAdding && <LanguageRow valt={valt} isAddMode={true} onCancelAdd={() => setIsAdding(false)} />}
        </div>
      </div>
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button
          className='btn btn-primary'
          disabled={!snap.initialized || isAdding}
          onClick={() => setIsAdding(true)}
        >
          <Icon name='plus' className='size-4' />
          Add Language
        </button>
      </footer>
    </div>
  );
}

Languages.displayName = 'Languages';
