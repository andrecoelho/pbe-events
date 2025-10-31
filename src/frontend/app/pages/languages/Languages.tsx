import { AddLanguageRow } from '@/frontend/app/pages/languages/AddLanguageRow';
import { LanguageRow } from '@/frontend/app/pages/languages/LanguageRow';
import { LanguagesValt } from '@/frontend/app/pages/languages/languagesValt';
import { Loading } from '@/frontend/components/Loading';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Languages.css';

const init = () => {
  const languagesValt = new LanguagesValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/languages\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    languagesValt.init(eventId);
  }

  return { languagesValt };
};

export function Languages() {
  const { languagesValt } = useMemo(init, []);
  const snap = useSnapshot(languagesValt.store);

  if (!snap.initialized) {
    return <Loading backgroundColor='bg-base-100' indicatorColor='bg-primary' />;
  }

  return (
    <div className='Languages bg-base-100 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex flex-col flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Languages</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
        <div className='grid grid-cols-[120px_1fr_140px] text-sm w-[800px] self-center'>
          {/* Header */}
          <div className='col-code col-header font-bold'>Code</div>
          <div className='col-name col-header font-bold'>Name</div>
          <div className='col-actions col-header font-bold'>Actions</div>

          {/* Language Rows */}
          {snap.languages.map((language) => (
            <LanguageRow key={language.id} language={language} valt={languagesValt} />
          ))}

          {/* Add Row */}
          <AddLanguageRow valt={languagesValt} />
        </div>
      </div>
    </div>
  );
}

Languages.displayName = 'Languages';
