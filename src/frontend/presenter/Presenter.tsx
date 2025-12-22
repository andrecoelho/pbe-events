import { ActiveItemScreen } from '@/frontend/components/ActiveItemScreens/ActiveItemScreen';
import { Icon } from '@/frontend/components/Icon';
import { PresenterValt } from '@/frontend/presenter/presenterValt';
import { useEffect, useMemo, useState } from 'react';
import logo from 'src/assets/PBE-logo_600px.png';
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

  const handleReconnect = () => {
    valt.connect();
  };

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
        <img src={logo} className='absolute w-200 opacity-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
        <ActiveItemScreen activeItem={snap.activeItem} languages={snap.languages} runStatus={snap.runStatus} />
        {snap.connectionState !== 'connected' && (
          <div className='absolute bottom-2 left-2'>
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
          </div>
        )}
      </div>
    </div>
  );
};

Presenter.displayName = 'Presenter';
