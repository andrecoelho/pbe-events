import { Icon } from '@/frontend/components/Icon';
import { TeamActiveItemScreen } from '@/frontend/team/TeamActiveScreen/TeamActiveItemScreen';
import { TeamValt, TeamValtContext } from '@/frontend/team/teamValt';
import { useEffect, useMemo, useState } from 'react';
import logo from '@/assets/PBE-logo_600px.png';
import { useSnapshot } from 'valtio';
import '../base.css';

const init = () => {
  const valt = new TeamValt();

  const handleReconnect = () => {
    valt.connect();
  };

  valt.connect();

  return { valt, handleReconnect };
};

export const Team = () => {
  const { valt, handleReconnect } = useMemo(init, []);
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

    return () => {
      window.removeEventListener('resize', calculateScale);
      valt.cleanup();
    };
  }, [valt]);

  // Another tab or window on this device took over the team (#30).
  if (snap.connectionState === 'replaced') {
    return (
      <div className='fixed inset-0 flex justify-center items-center bg-primary p-4'>
        <div className='card bg-base-100 shadow-xl w-full max-w-md'>
          <div className='card-body items-center text-center gap-4'>
            <img src={logo} className='h-24' alt='Pathfinder Bible Experience' />
            <h1 className='card-title text-2xl'>This team is open in another tab</h1>
            <p className='text-base-content/70'>
              Only one tab or window can be connected for the team. Close the other one, or use this one instead.
            </p>
            <button className='btn btn-primary btn-lg w-full' onClick={handleReconnect}>
              Use this tab
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (snap.connectionState === 'connected' && snap.errorMessage) {
    return (
      <div className='absolute bottom-2 left-2'>
        <span className='alert alert-error w-lg'>
          <Icon name='x-circle' className='size-5' />
          {snap.errorMessage}
          {snap.errorCode === 'RELEASED' ? (
            <a className='btn btn-primary btn-xs' href='/join'>
              <Icon name='chevron-right' className='size-3' />
              Join Again
            </a>
          ) : (
            <button className='btn btn-primary btn-xs' onClick={handleReconnect}>
              <Icon name='arrow-path' className='size-3' />
              Try Again
            </button>
          )}
        </span>
      </div>
    );
  }

  if (!snap.event || !snap.team || !snap.languages || !snap.team.languageCode) {
    return <div className='flex-1 flex justify-center items-center alert alert-info'>Connecting...</div>;
  }

  return (
    <TeamValtContext.Provider value={valt}>
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
          <TeamActiveItemScreen />
          {snap.connectionState !== 'connected' && (
            <div className='absolute bottom-2 left-2'>
              {snap.connectionState === 'connecting' && (
                <span className='alert alert-info w-lg'>
                  <Icon name='information-circle' className='size-5' />
                  Reconnecting&hellip; Your answers will be sent as soon as the connection is back.
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
                  Your internet is down. Your answers will be sent as soon as it’s back.
                </span>
              )}
            </div>
          )}
        </div>
        <div className='absolute bottom-8 right-8 text-sm opacity-50 flex flex-col text-base-100'>
          <div>
            <span className='font-bold'>Event:</span> {snap.event.name}
          </div>
          <div>
            <span className='font-bold'>Team:</span> {snap.team.name}
          </div>
          <div>
            <span className='font-bold'>Language:</span> {snap.languages[snap.team.languageCode]!.name}
          </div>
        </div>
      </div>
    </TeamValtContext.Provider>
  );
};

Team.displayName = 'Team';
