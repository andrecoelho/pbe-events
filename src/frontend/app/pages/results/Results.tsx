import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import { ResultsValt, ResultsValtContext, useResultsValt } from './resultsValt';
import { Loading } from '@/frontend/components/Loading';

const FIRST_THRESHOLD = 90;
const SECOND_THRESHOLD = 80;
const THIRD_THRESHOLD = 70;

const ResultsContent = () => {
  const valt = useResultsValt();
  const snap = useSnapshot(valt.store);

  useEffect(() => {
    const url = new URL(window.location.href);
    const match = url.pathname.match(/^\/results\/([^/]+)$/);
    const eventId = match ? match[1] : undefined;

    if (eventId && !snap.initialized) {
      valt.init(eventId);
    }
  }, [valt, snap.initialized]);

  if (!snap.initialized) {
    return (
      <div className='flex-1 overflow-auto p-8 pt-4 place-items-center'>
        <Loading />
      </div>
    );
  }

  if (snap.teams.length === 0) {
    return (
      <div className='flex-1 overflow-auto p-8 pt-4 place-items-center'>
        <h1 className='text-3xl font-bold mb-1 text-center'>
          Results <span className='text-neutral brightness-75'>{snap.eventName}</span>
        </h1>
        <div className='text-center mt-8'>
          <p className='text-lg text-base-content/60'>No results available yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex-1 overflow-auto p-8 pt-4 place-items-center'>
      <h1 className='text-3xl font-bold mb-4 text-center'>
        Results <span className='text-neutral brightness-75'>{snap.eventName}</span>
      </h1>

      {/* Chart container */}
      <div className=''>
        <div className='relative'>
          {/* Horizontal reference lines */}
          <div
            className='absolute left-0 right-0 border-t-2 border-dashed border-neutral-300 pointer-events-none'
            style={{ top: '0%' }}
          >
            <span className='absolute -left-12 -top-3 text-sm text-neutral-500'>100%</span>
          </div>
          <div
            className='absolute left-0 right-0 border-t-2 border-dashed border-success/50 pointer-events-none'
            style={{ top: `${100 - FIRST_THRESHOLD}%` }}
          >
            <span className='absolute -left-12 -top-3 text-sm text-success'>{FIRST_THRESHOLD}%</span>
          </div>
          <div
            className='absolute left-0 right-0 border-t-2 border-dashed border-accent/50 pointer-events-none'
            style={{ top: `${100 - SECOND_THRESHOLD}%` }}
          >
            <span className='absolute -left-12 -top-3 text-sm text-accent'>{SECOND_THRESHOLD}%</span>
          </div>
          <div
            className='absolute left-0 right-0 border-t-2 border-dashed border-error/50 pointer-events-none'
            style={{ top: `${100 - THIRD_THRESHOLD}%` }}
          >
            <span className='absolute -left-12 -top-3 text-sm text-error'>{THIRD_THRESHOLD}%</span>
          </div>

          {/* Bar chart */}
          <div className='flex h-96 items-end gap-2'>
            {snap.teams.map((team) => {
              const height = team.percentage;
              let colorClass = 'bg-neutral';

              if (height >= FIRST_THRESHOLD) {
                colorClass = 'bg-success';
              } else if (height >= SECOND_THRESHOLD) {
                colorClass = 'bg-accent';
              } else if (height >= THIRD_THRESHOLD) {
                colorClass = 'bg-error';
              }

              return (
                <div
                  key={team.id}
                  className={`flex-1 rounded-sm ${colorClass} transition-all duration-300 hover:opacity-80 cursor-pointer z-1 text-center pt-2`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${team.name}: ${team.totalPoints}/${snap.maxPoints} (${height.toFixed(1)}%)`}
                >
                  {team.percentage.toFixed(2)}%
                </div>
              );
            })}
          </div>
        </div>

        {/* Team numbers */}
        <div className='flex gap-2 mt-2'>
          {snap.teams.map((team) => (
            <div key={team.id} className='flex-1 text-xs text-center font-semibold'>
              {team.number}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className='mt-8 flex justify-center gap-6 text-sm'>
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 bg-success rounded'></div>
            <span>≥ {FIRST_THRESHOLD}%</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 bg-accent rounded'></div>
            <span>≥ {SECOND_THRESHOLD}%</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 bg-error rounded'></div>
            <span>≥ {THIRD_THRESHOLD}%</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 bg-neutral rounded'></div>
            <span>&lt; {THIRD_THRESHOLD}%</span>
          </div>
        </div>

        {/* Team details table */}
        <div className='mt-8 overflow-x-auto'>
          <table className='table table-md'>
            <thead>
              <tr>
                <th>Team #</th>
                <th>Team Name</th>
                <th>Language</th>
                <th>Points</th>
                <th>Absolute Percentage</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {snap.teams.map((team, index) => (
                <tr key={team.id}>
                  <td className='font-semibold'>{team.number}</td>
                  <td>{team.name}</td>
                  <td>{team.languageName}</td>
                  <td>
                    {team.totalPoints}/{snap.maxPoints}
                  </td>
                  <td>
                    {team.absPercentage.toFixed(2)}%
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        team.percentage >= 90
                          ? 'badge-success'
                          : team.percentage >= 80
                          ? 'badge-accent'
                          : team.percentage >= 70
                          ? 'badge-error'
                          : 'badge-ghost'
                      }`}
                    >
                      {team.percentage.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const Results = () => {
  const valt = useMemo(() => new ResultsValt(), []);

  return (
    <ResultsValtContext.Provider value={valt}>
      <div className='Results bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
        <ResultsContent />
        <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end gap-4 shadow-md-top'>
          <button className='btn btn-secondary' onClick={() => valt.downloadRawAnswersCSV()}>
            Download Raw Answers CSV
          </button>
          <button className='btn btn-primary' onClick={() => valt.downloadResultsCSV()}>
            Download Results CSV
          </button>
        </footer>
      </div>
    </ResultsValtContext.Provider>
  );
};
