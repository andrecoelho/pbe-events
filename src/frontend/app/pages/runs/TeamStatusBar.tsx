import { useSnapshot } from 'valtio';
import { useHostValt } from './hostValt';

export function TeamStatusBar() {
  const valt = useHostValt();
  const snap = useSnapshot(valt.store);

  const teams = Array.from(snap.teams.values()).sort((a, b) => a.number - b.number);
  const readyCount = teams.filter((t) => t.status === 'ready').length;
  const totalCount = teams.length;

  return (
    <div className='card bg-base-200 shadow-md'>
      <div className='card-body p-4'>
        <div className='flex items-center justify-between mb-2'>
          <h3 className='text-lg font-semibold'>
            Team Status: {readyCount}/{totalCount} Ready
          </h3>
        </div>
        <div className='flex flex-wrap gap-2'>
          {teams.map((team) => {
            const badgeClass =
              team.status === 'offline'
                ? 'badge-ghost'
                : team.status === 'connected'
                  ? 'badge-warning'
                  : team.status === 'ready'
                    ? 'badge-success'
                    : 'badge-info';

            return (
              <div
                key={team.teamId}
                className={`badge badge-lg ${badgeClass} ${team.hasAnswer ? 'badge-info' : ''}`}
              >
                #{team.number} {team.name} ({team.languageCode})
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

TeamStatusBar.displayName = 'TeamStatusBar';
