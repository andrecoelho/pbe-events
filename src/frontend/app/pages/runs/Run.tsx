import type { TeamStatus } from '@/frontend/app/pages/runs/runValt';
import { RunValt, RunValtContext } from '@/frontend/app/pages/runs/runValt';
import { ActiveItemScreen } from '@/frontend/components/ActiveItemScreens/ActiveItemScreen';
import { confirmModal } from '@/frontend/components/ConfirmModal';
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
    await valt.updateRunStatus('in_progress');
  };

  const handlePauseEvent = async () => {
    await valt.updateRunStatus('paused');
  };

  const handleResumeEvent = async () => {
    await valt.updateRunStatus('in_progress');
  };

  const handleCompleteEvent = async () => {
    await valt.updateRunStatus('completed');
  };

  const handleResetEvent = async () => {
    const confirmed = await confirmModal.open(
      'Are you sure you want to reset this run? All team answers will be deleted.'
    );

    if (confirmed) {
      await valt.updateRunStatus('not_started');
    }
  };

  const handlePreviousEvent = async () => {
    valt.previous();
  };

  const handleNextEvent = async () => {
    valt.next();
  };

  const handleRemoveTimer = async () => {
    valt.removeTimer();
  };

  const handleRestartTimer = async () => {
    valt.restartTimer();
  };

  const handleUpdateGracePeriod = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const gracePeriod = Number(event.target.value);

    if (gracePeriod >= 0) {
      await valt.updateGracePeriod(gracePeriod);
    }
  };

  const handleOpenPresenter = () => {
    window.open(`/event-run/presenter?eventId=${eventId}`, '_blank', 'width=800,height=600,popup=yes');
  };

  const handleReconnect = () => {
    valt.connect();
  };

  return {
    valt,
    handleStartEvent,
    handlePauseEvent,
    handleResumeEvent,
    handleCompleteEvent,
    handleResetEvent,
    handlePreviousEvent,
    handleNextEvent,
    handleRemoveTimer,
    handleRestartTimer,
    handleOpenPresenter,
    handleUpdateGracePeriod,
    handleReconnect
  };
};

export const Run = () => {
  const {
    valt,
    handleStartEvent,
    handlePauseEvent,
    handleResumeEvent,
    handleCompleteEvent,
    handleResetEvent,
    handlePreviousEvent,
    handleNextEvent,
    handleRemoveTimer,
    handleRestartTimer,
    handleOpenPresenter,
    handleUpdateGracePeriod,
    handleReconnect
  } = useMemo(init, []);

  const snap = useSnapshot(valt.store);

  const activeTeamsCount = useMemo(
    () => Object.values(snap.teams).filter((t) => t.status !== 'offline').length,
    [snap.teams]
  );

  const sortedTeams = useMemo(
    () =>
      Object.keys(snap.teams).sort((a, b) => {
        const teamA = snap.teams[a]!;
        const teamB = snap.teams[b]!;

        return teamA.number === teamB.number ? 0 : teamA.number < teamB.number ? -1 : 1;
      }),
    [snap.teams]
  );

  useEffect(() => valt.cleanup, [valt]);

  return (
    <RunValtContext.Provider value={valt}>
      <div className='Run bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
        <div className='flex-1 overflow-auto p-8 pt-4 place-items-center'>
          <h1 className='text-3xl font-bold mb-1 text-center'>
            Run &nbsp;
            <span className='text-neutral brightness-75'>{snap.eventName}</span>
          </h1>

          {/* Current Slide */}
          <div className='card shadow-md w-200 h-150 bg-primary relative flex items-center justify-center'>
            <img src={logo} className='opacity-10' />
            <ActiveItemScreen activeItem={snap.run.activeItem} languages={snap.languages} runStatus={snap.run.status} />
          </div>

          {/* Team connection status */}
          <div
            className={`card shadow-xl w-200 mt-4 overflow-hidden ${
              snap.connectionState !== 'connected' ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {/* Header with accent gradient effect */}
            <div className='relative bg-gradient-to-r from-accent via-amber-400 to-orange-400 p-4'>
              <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/25 via-transparent to-transparent' />
              <div className='relative flex items-center justify-between text-accent-content'>
                <div className='flex items-baseline gap-2'>
                  <span className='text-sm uppercase tracking-wide opacity-70'>Teams</span>
                  <span className='text-sm font-semibold'>CONNECTION STATUS</span>
                </div>
                <div className='text-sm tracking-wide'>
                  <span>GRACE PERIOD: </span>
                  <span>
                    <input
                      type='number'
                      disabled={snap.connectionState !== 'connected'}
                      value={snap.run.gracePeriod}
                      className='w-10 pl-3 bg-base-100/50 rounded-md text-center'
                      onChange={handleUpdateGracePeriod}
                    />
                    &nbsp;seconds
                  </span>
                </div>
                <div className='badge bg-black/10 border-black/20 text-accent-content font-semibold px-3 py-2'>
                  {activeTeamsCount} active
                </div>
              </div>
            </div>
            {/* White body for team badges */}
            <div className={`bg-base-100 p-5 ${snap.connectionState !== 'connected' ? 'opacity-50' : ''}`}>
              <div className='flex flex-wrap gap-3'>
                {sortedTeams.map((teamId) => {
                  const team = snap.teams[teamId]!;
                  const activeItem = snap.run.activeItem;
                  const isQuestion = activeItem?.type === 'question';

                  const teamHasAnswer =
                    (isQuestion && activeItem.phase === 'answer' && activeItem.answers[teamId]?.answerText != null) ||
                    (isQuestion && activeItem.phase === 'prompt' && activeItem.answers[teamId]);

                  const isBadgeAllowed =
                    activeItem?.type === 'question' &&
                    (activeItem.phase === 'answer' || (activeItem.phase === 'prompt' && teamHasAnswer));

                  const stateClass = TEAM_STATE_CLASSES[team.status] ?? TEAM_STATE_CLASSES.offline;

                  return (
                    <span key={teamId} className='relative inline-flex'>
                      <span className={`team-badge ${stateClass}`}>{formatTeamNumber(team.number)}</span>
                      {isBadgeAllowed && teamHasAnswer && (
                        <span className='team-badge-check'>
                          <Icon name='check' className='size-3' />
                        </span>
                      )}
                      {isBadgeAllowed && !teamHasAnswer && (
                        <span className='team-badge-no-answer'>
                          <Icon name='x-mark' className='size-3' />
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Team connection status legend */}
          <div
            className={`mt-3 text-xs text-neutral flex gap-6 flex-wrap ${
              snap.connectionState !== 'connected' ? 'opacity-50' : ''
            }`}
          >
            <div className='flex items-center gap-2'>
              <span className='relative inline-flex'>
                <span className='team-badge team-badge--sm team-badge--offline'>04</span>
              </span>
              <span>Offline</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='relative inline-flex'>
                <span className='team-badge team-badge--sm team-badge--offline'>04</span>
                <span className='team-badge-no-answer'>
                  <Icon name='x-mark' />
                </span>
              </span>
              <span>Offline + No Answer</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='relative inline-flex'>
                <span className='team-badge team-badge--sm team-badge--ready'>23</span>
              </span>
              <span>Connected</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='relative inline-flex'>
                <span className='team-badge team-badge--sm team-badge--ready'>23</span>
                <span className='team-badge-check'>
                  <Icon name='check' />
                </span>
              </span>
              <span>Connected + Answer</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='relative inline-flex'>
                <span className='team-badge team-badge--sm team-badge--ready'>23</span>
                <span className='team-badge-no-answer'>
                  <Icon name='x-mark' />
                </span>
              </span>
              <span>Connected + No Answer</span>
            </div>
          </div>
        </div>

        <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between items-center shadow-md-top'>
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

          {snap.connectionState === 'connected' && (
            <div className='flex gap-2'>
              {snap.run.status === 'not_started' && (
                <button className='btn btn-success' onClick={handleStartEvent}>
                  <Icon name='play' className='size-4' />
                  Start
                </button>
              )}
              {snap.run.status === 'paused' && (
                <button className='btn btn-success' onClick={handleResumeEvent}>
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

              {snap.run.status === 'in_progress' && (
                <button className='btn btn-neutral' onClick={handlePreviousEvent}>
                  <Icon name='chevron-left' className='size-4' />
                  Previous
                </button>
              )}

              {snap.run.status === 'in_progress' && (
                <button className='btn btn-neutral' onClick={handleNextEvent}>
                  Next
                  <Icon name='chevron-right' className='size-4' />
                </button>
              )}
            </div>
          )}

          {snap.connectionState === 'connected' && (
            <div className='flex gap-2'>
              {snap.run.activeItem &&
                snap.run.activeItem.type === 'question' &&
                snap.run.activeItem.phase === 'prompt' &&
                typeof snap.run.activeItem.startTime === 'string' && (
                  <button
                    className='btn btn-outline tooltip tooltip-neutral font-normal border-red-400'
                    data-tip='Remove Timer'
                    aria-label='Remove Timer'
                    onClick={handleRemoveTimer}
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='size-5 text-red-400'>
                      <path d='M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM20.57 16.476c-.223.082-.448.161-.674.238L7.319 4.137A6.75 6.75 0 0 1 18.75 9v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206Z' />
                      <path
                        fill-rule='evenodd'
                        d='M5.25 9c0-.184.007-.366.022-.546l10.384 10.384a3.751 3.751 0 0 1-7.396-1.119 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z'
                        clip-rule='evenodd'
                      />
                    </svg>
                  </button>
                )}

              {snap.run.activeItem &&
                snap.run.activeItem.type === 'question' &&
                snap.run.activeItem.phase === 'prompt' && (
                  <button
                    className='btn btn-outline tooltip tooltip-neutral font-normal border-sky-600'
                    data-tip='Restart Timer'
                    aria-label='Restart Timer'
                    onClick={handleRestartTimer}
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='size-5 text-sky-600'>
                      <path
                        fill-rule='evenodd'
                        d='M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z'
                        clip-rule='evenodd'
                      />
                    </svg>
                  </button>
                )}

              <button className='btn btn-accent' onClick={handleOpenPresenter}>
                <Icon name='presentation-chart-bar' className='size-4' />
                Presenter
              </button>
            </div>
          )}
        </footer>
      </div>
    </RunValtContext.Provider>
  );
};

Run.displayName = 'Run';
