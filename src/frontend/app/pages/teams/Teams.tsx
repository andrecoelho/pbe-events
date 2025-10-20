import { TeamsValt } from '@/frontend/app/pages/teams/teamsValt';
import { teamsModal } from '@/frontend/app/pages/teams/TeamsModal';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { Loading } from '@/frontend/components/Loading';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Teams.css';

const init = () => {
  const teamsValt = new TeamsValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/teams\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    teamsValt.init(eventId);
  }

  const handleAddTeam = async () => {
    await teamsModal.open(teamsValt);
  };

  const handleEditTeam = async (team: { id: string; name: string; number: number }) => {
    await teamsModal.open(teamsValt, team);
  };

  const handleRemoveTeam = async (team: { id: string; name: string; number: number }) => {
    const confirmation = await confirmModal.open(`Are you sure you want to delete team "${team.name}"?`);

    if (confirmation) {
      await teamsValt.deleteTeam(team.id);
    }
  };

  return { teamsValt, handleAddTeam, handleEditTeam, handleRemoveTeam };
};

export function Teams() {
  const { teamsValt, handleAddTeam, handleEditTeam, handleRemoveTeam } = useMemo(init, []);
  const snap = useSnapshot(teamsValt.store);

  if (!snap.initialized) {
    return <Loading backgroundColor='bg-base-100' indicatorColor='bg-primary' />;
  }

  return (
    <div className='Teams bg-base-100 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Teams</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
        <div className='overflow-x-auto'>
          <table className='table'>
            <thead>
              <tr>
                <th className='col-number'>#</th>
                <th className='col-name'>Name</th>
                <th className='col-actions'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {snap.teams.map((team) => (
                <tr key={team.id}>
                  <td className='col-number'>{team.number}</td>
                  <td className='col-name'>{team.name}</td>
                  <td className='col-actions'>
                    <a className='tooltip tooltip-neutral' data-tip='Edit' onClick={() => handleEditTeam(team)}>
                      <Icon name='pencil-square' className='text-accent cursor-pointer hover:brightness-75' />
                    </a>
                    <a className='tooltip tooltip-neutral' data-tip='Connection Link'>
                      <Icon name='link' className='text-info' />
                    </a>
                    <a className='tooltip tooltip-neutral' data-tip='Delete' onClick={() => handleRemoveTeam(team)}>
                      <Icon name='trash' className='text-error cursor-pointer hover:brightness-75' />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary' onClick={handleAddTeam}>
          Add Team
        </button>
      </footer>
    </div>
  );
}

Teams.displayName = 'Teams';
