import { Icon } from '@/frontend/components/Icon';
import { TeamActiveItemScreen } from '@/frontend/team/TeamActiveScreen/TeamActiveItemScreen';
import { TeamValt, TeamValtContext } from '@/frontend/team/teamValt';
import { useEffect, useMemo, useState } from 'react';
import logo from 'src/assets/PBE-logo_600px.png';
import { useSnapshot } from 'valtio';
import '../base.css';

const init = () => {
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get('eventId');
  const teamId = url.searchParams.get('teamId');

  const valt = new TeamValt(eventId, teamId);

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
  }, []);

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
