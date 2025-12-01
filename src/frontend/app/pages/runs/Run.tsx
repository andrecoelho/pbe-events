import type { TeamStatus } from '@/frontend/app/pages/runs/runValt';
import { RunValt } from '@/frontend/app/pages/runs/runValt';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useEffect, useMemo } from 'react';
import logo from 'src/assets/favicon.svg';
import { useSnapshot } from 'valtio';
import './Run.css';

const TEAM_STATE_CLASSES: Record<TeamStatus['status'], string> = {
  offline: 'team-badge--offline',
  connected: 'team-badge--connected',
  ready: 'team-badge--ready'
};

const formatTeamNumber = (value: number) => value.toString().padStart(2, '0');

const init = () => {
  const valt = new RunValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/run\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    valt.init(eventId).then((result: { ok: boolean; error?: string }) => {
      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    });
  }

  const handleStartEvent = async () => {
    await valt.startRun();
  };

  const handlePauseEvent = async () => {
    await valt.pauseRun();
  };

  const handleResumeRun = async () => {
    await valt.resumeRun();
  };

  const handleCompleteEvent = async () => {
    await valt.completeRun();
  };

  const handleResetEvent = async () => {
    await valt.resetRun();
  };

  return { valt, handleStartEvent, handlePauseEvent, handleResumeRun, handleCompleteEvent, handleResetEvent };
};

export const Run = () => {
  const { valt, handleStartEvent, handlePauseEvent, handleResumeRun, handleCompleteEvent, handleResetEvent } = useMemo(
    () => init(),
    []
  );

  const snap = useSnapshot(valt.store);

  useEffect(() => {
    return () => {
      valt.disconnectWebSocket();
    };
  }, [valt]);

  return (
    <div className='Run bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8 place-items-center'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Run</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>

        {/* Current Slide */}
        <div className='card shadow-md w-180 h-135 bg-primary relative flex items-center justify-center p-10'>
          <img src={logo} className='opacity-20' />
        </div>

        {/* Team connection status */}
        <div className='card shadow-xl w-180 mt-4 overflow-hidden'>
          {/* Header with accent gradient effect */}
          <div className='relative bg-gradient-to-r from-accent via-amber-400 to-orange-400 p-4'>
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/25 via-transparent to-transparent'></div>
            <div className='relative flex items-center justify-between text-accent-content'>
              <div className='flex items-baseline gap-2'>
                <span className='text-sm uppercase tracking-wide opacity-70'>Teams</span>
                <span className='text-sm font-semibold'>CONNECTION STATUS</span>
              </div>
              <div className='badge bg-black/10 border-black/20 text-accent-content font-semibold px-3 py-2'>
                {Object.keys(snap.teams).length} active
              </div>
            </div>
          </div>
          {/* White body for team badges */}
          <div className='bg-base-100 p-5'>
            <div className='flex flex-wrap gap-3'>
              {Object.keys(snap.teams).map((teamId) => {
                const team = snap.teams[teamId]!;
                const stateClass = TEAM_STATE_CLASSES[team.status] ?? TEAM_STATE_CLASSES.offline;

                return (
                  <span key={teamId} className='relative inline-flex'>
                    <span className={`team-badge ${stateClass}`}>{formatTeamNumber(team.number)}</span>
                    {team.hasAnswer && (
                      <span className='team-badge-check'>
                        <Icon name='check' className='size-3' />
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Team connection status legend */}
        <div className='mt-3 text-xs text-neutral flex gap-6 flex-wrap'>
          <div className='flex items-center gap-2'>
            <span className='relative inline-flex'>
              <span className='team-badge team-badge--sm team-badge--offline'>04</span>
            </span>
            <span>Offline team</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='relative inline-flex'>
              <span className='team-badge team-badge--sm team-badge--connected'>11</span>
            </span>
            <span>Connected, not ready</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='relative inline-flex'>
              <span className='team-badge team-badge--sm team-badge--ready'>23</span>
              <span className='team-badge-check'>
                <Icon name='check' className='size-1.5' />
              </span>
            </span>
            <span>Ready + answered</span>
          </div>
        </div>
      </div>

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between shadow-md-top'>
        <div className='flex gap-2'>
          {snap.run.status === 'not_started' && (
            <button className='btn btn-success' onClick={handleStartEvent}>
              <Icon name='play' className='size-4' />
              Start
            </button>
          )}
          {snap.run.status === 'paused' && (
            <button className='btn btn-success' onClick={handleResumeRun}>
              <Icon name='play' className='size-4' />
              Resume
            </button>
          )}
          {snap.run.status === 'in_progress' && (
            <button className='btn btn-info' onClick={handlePauseEvent}>
              <Icon name='pause' className='size-4' />
              Pause
            </button>
          )}
          {snap.run.status !== 'completed' && snap.run.status !== 'not_started' && (
            <button className='btn btn-error' onClick={handleCompleteEvent}>
              <Icon name='stop' className='size-4' />
              Complete
            </button>
          )}
          {snap.run.status === 'completed' && (
            <button className='btn btn-warning' onClick={handleResetEvent}>
              <Icon name='arrow-path' className='size-4' />
              Reset
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

Run.displayName = 'Run';
