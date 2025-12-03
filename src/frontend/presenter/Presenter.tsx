import { ActiveItemScreen } from '@/frontend/components/ActiveItemScreens/ActiveItemScreen';
import { PresenterValt } from '@/frontend/presenter/presenterValt';
import { useMemo, useState, useEffect } from 'react';
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
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calculateScale = () => {
      const baseWidth = 800;
      const baseHeight = 600;
      const scaleX = window.innerWidth / baseWidth;
      const scaleY = window.innerHeight / baseHeight;

      setScale(Math.min(scaleX, scaleY));
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);

    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  if (!valt) {
    return <div>Initialization error. Check console for details.</div>;
  }

  return (
    <div className='fixed inset-0 flex justify-center items-center bg-primary'>
      <div
        className='absolute w-200 h-150'
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          left: '50%',
          top: '50%',
          marginLeft: '-400px',
          marginTop: '-300px'
        }}
      >
        <img
          src={logo}
          className='absolute w-200 opacity-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
        />
        <ActiveItemScreen activeItem={snap.activeItem} languages={snap.languages} runStatus={snap.runStatus} />
      </div>
    </div>
  );
};

Presenter.displayName = 'Presenter';
