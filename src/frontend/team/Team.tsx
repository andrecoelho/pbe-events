import { TeamValt } from '@/frontend/team/teamValt';
import { useMemo } from 'react';

const init = () => {
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get('eventId');
  const teamId = url.searchParams.get('teamId');

  if (!eventId) {
    console.error('No eventId found in URL');
    return;
  }

  if (!teamId) {
    console.error('No teamId found in URL');
    return;
  }

  const valt = new TeamValt(eventId, teamId);

  valt.init().catch((error) => {
    console.error('Failed to initialize TeamValt:', error);
  });
};

export const Team = () => {
  useMemo(init, []);

  return <div className='flex justify-center items-center h-screen'>Welcome, Team Member!</div>;
};

Team.displayName = 'Team';
