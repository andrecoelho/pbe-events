import { TeamActiveItemScreen } from '@/frontend/team/TeamActiveScreen/TeamActiveItemScreen';
import { TeamValt, TeamValtContext } from '@/frontend/team/teamValt';
import { useEffect, useMemo, useState } from 'react';
import logo from 'src/assets/favicon.svg';
import '../base.css';
import { useSnapshot } from 'valtio';

const init = () => {
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get('eventId');
  const teamId = url.searchParams.get('teamId');

  const valt = new TeamValt();

  valt.init(eventId, teamId).catch((error) => {
    console.error('Failed to initialize TeamValt:', error);
  });

  return { valt };
};

export const Team = () => {
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
    return <div className='alert alert-error'>Initialization error. Check console for details.</div>;
  }

  if (!snap.event || !snap.team || !snap.languages || !snap.team.languageCode) {
    return <div className='flex-1 flex justify-center items-center'>Loading...</div>;
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
