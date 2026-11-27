import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { formatBytes, formatDuration } from '@/frontend/app/pages/admin/adminFormat';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import { useEffect } from 'react';
import { useSnapshot } from 'valtio';

const REPO = 'https://github.com/andrecoelho/pbe-events';

// Database round trips above this are worth a look (a healthy one is a few ms).
const SLOW_DB_MS = 50;

const formatTime = (time: number | string) =>
  new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

function HealthPage() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.health);

  useEffect(() => valt.poll(valt.loadHealth), [valt]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  if (!snap.data) {
    return (
      <div role='alert' className='alert alert-error max-w-xl'>
        Couldn’t read the server’s health. {snap.error}
      </div>
    );
  }

  const { version, process, database, databaseError, live, problems, serverTime } = snap.data;
  const shortCommit = version.commit?.slice(0, 7);

  return (
    <div className='flex flex-col gap-6 max-w-6xl'>
      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t refresh. {snap.error}
        </div>
      )}

      <div className='stats stats-vertical md:stats-horizontal shadow-sm bg-base-100'>
        <div className='stat'>
          <div className='stat-title'>Up for</div>
          <div className='stat-value text-2xl'>{formatDuration(process.uptimeSeconds * 1000)}</div>
          <div className='stat-desc'>since {formatTime(version.startedAt)}</div>
        </div>
        <div className='stat'>
          <div className='stat-title'>Memory</div>
          <div className='stat-value text-2xl'>{formatBytes(process.rssBytes)}</div>
          <div className='stat-desc'>
            heap {formatBytes(process.heapUsedBytes)} of {formatBytes(process.heapTotalBytes)}
          </div>
        </div>
        <div className='stat'>
          <div className='stat-title'>Database</div>
          {database ? (
            <>
              <div className={`stat-value text-2xl ${database.latencyMs > SLOW_DB_MS ? 'text-warning' : ''}`}>
                {database.latencyMs} ms
              </div>
              <div className='stat-desc'>round trip · {formatBytes(database.sizeBytes)} stored</div>
            </>
          ) : (
            <>
              <div className='stat-value text-2xl text-error'>Unreachable</div>
              <div className='stat-desc whitespace-normal'>{databaseError}</div>
            </>
          )}
        </div>
        <div className='stat'>
          <div className='stat-title'>Live</div>
          <div className='stat-value text-2xl'>{live.sockets}</div>
          <div className='stat-desc'>
            {live.sockets === 1 ? 'connection' : 'connections'} · {live.events}{' '}
            {live.events === 1 ? 'event open' : 'events open'}
          </div>
        </div>
      </div>

      <section className='flex flex-col gap-1'>
        <h3 className='text-lg font-semibold'>Version</h3>
        <p>
          {shortCommit ? (
            <a className='link font-mono' href={`${REPO}/commit/${version.commit}`} target='_blank' rel='noreferrer'>
              {shortCommit}
            </a>
          ) : (
            'Unknown commit'
          )}{' '}
          · {version.environment} · Bun {version.bun}
        </p>
        {database?.latestMigration && (
          <p className='text-sm text-base-content/70'>
            Latest migration {database.latestMigration.name}, applied {formatTime(database.latestMigration.appliedAt)}
          </p>
        )}
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-lg font-semibold'>
          Recent errors and warnings{' '}
          <span className='text-base-content/60 font-normal text-base'>
            {problems.totals.error} {problems.totals.error === 1 ? 'error' : 'errors'} and {problems.totals.warn}{' '}
            {problems.totals.warn === 1 ? 'warning' : 'warnings'} since the server started
          </span>
        </h3>
        {problems.recent.length === 0 ? (
          <p className='text-base-content/60'>None since the server started.</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='table table-sm'>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Level</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {problems.recent.map((problem, index) => (
                  <tr key={`${problem.time}:${index}`} className='align-top'>
                    <td className='whitespace-nowrap'>
                      {formatDuration(serverTime - problem.time)} ago
                      <div className='text-xs text-base-content/60'>{formatTime(problem.time)}</div>
                    </td>
                    <td>
                      <span className={`badge badge-sm ${problem.level === 'error' ? 'badge-error' : 'badge-warning'}`}>
                        {problem.level}
                      </span>
                    </td>
                    <td>
                      <pre className='whitespace-pre-wrap break-all text-xs max-h-48 overflow-auto'>
                        {problem.message}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className='text-sm text-base-content/60'>
          The last 50, kept in memory: a restart or deploy clears them. Railway’s logs have the rest.
        </p>
      </section>
    </div>
  );
}

export function Health() {
  return (
    <AdminLayout tab='health'>
      <HealthPage />
    </AdminLayout>
  );
}

Health.displayName = 'Health';
