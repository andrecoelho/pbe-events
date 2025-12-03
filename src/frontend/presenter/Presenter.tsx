import { ActiveItemScreen } from '@/frontend/components/ActiveItemScreens/ActiveItemScreen';
import { PresenterValt } from '@/frontend/presenter/presenterValt';
import { useMemo } from 'react';
import logo from 'src/assets/favicon.svg';
import { useSnapshot } from 'valtio';
import '../base.css';

const init = () => {
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get('eventId');

  const valt = new PresenterValt();

  valt.init(eventId).catch((error) => {
    console.error('Failed to initialize PresenterValt:', error);
  });

  return { valt };
};

export const Presenter = () => {
  const { valt } = useMemo(init, []);
  const snap = useSnapshot(valt.store);

  if (!valt) {
    return <div>Initialization error. Check console for details.</div>;
  }

  return (
    <div className='fixed inset-0 flex justify-center items-center bg-primary'>
      <img src={logo} className='opacity-10' />

      <ActiveItemScreen activeItem={snap.activeItem} languages={snap.languages} runStatus={snap.runStatus} />
    </div>
  );
};

Presenter.displayName = 'Presenter';
