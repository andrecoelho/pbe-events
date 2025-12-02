import { ActiveItemScreen } from '@/frontend/components/ActiveItemScreen';
import { TeamValt, TeamValtContext } from '@/frontend/team/teamValt';
import { useMemo } from 'react';
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

Team.displayName = 'Team';
