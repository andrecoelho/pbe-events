import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Runs.css';
import { HostValt, HostValtContext } from '@/frontend/app/pages/runs/hostValt';
import { gracePeriodModal } from '@/frontend/app/pages/runs/GracePeriodModal';
import { TeamStatusBar } from '@/frontend/app/pages/runs/TeamStatusBar';
import { QuestionSlideNavigator } from '@/frontend/app/pages/runs/QuestionSlideNavigator';
import { ActiveContentDisplay } from '@/frontend/app/pages/runs/ActiveContentDisplay';

const init = () => {
  const valt = new HostValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/host\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    valt.init(eventId).then((result: { ok: boolean; error?: string }) => {
      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    });
  }

  const handleStartEvent = async () => {
    const confirmation = await confirmModal.open('Are you sure you want to start this event?');

    if (confirmation) {
      const result = await valt.startRun();

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  const handleCompleteEvent = async () => {
    const confirmation = await confirmModal.open('Are you sure you want to complete this event?');

    if (confirmation) {
      const result = await valt.completeRun();

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  const handleUpdateGracePeriod = async () => {
    if (!valt.store.run) return;

    const gracePeriod = await gracePeriodModal.open(valt.store.run.gracePeriod);

    if (gracePeriod !== null) {
      const result = await valt.updateGracePeriod(gracePeriod);

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  const handleResetEvent = async () => {
    const confirmation = await confirmModal.open(
      'Are you sure you want to reset this event? This will delete all answers and reset the run status to not started.'
    );

    if (confirmation) {
      const result = await valt.resetRun();

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  return {
    valt,
    handleStartEvent,
    handleCompleteEvent,
    handleUpdateGracePeriod,
    handleResetEvent
  };
};

const statusBadges = {
  not_started: 'badge-warning',
  in_progress: 'badge-info',
  paused: 'badge-error',
  completed: 'badge-success'
} as const;

export function Host() {
  const { valt, handleStartEvent, handleCompleteEvent, handleUpdateGracePeriod, handleResetEvent } = useMemo(init, []);
  const snap = useSnapshot(valt.store);

  useEffect(() => {
    // Cleanup WebSocket on unmount
    return () => {
      valt.disconnectWebSocket();
    };
  }, [valt]);

  if (!snap.initialized || !snap.run) {
    return (
      <div className='Runs bg-base-100/95 flex-1 relative flex flex-col items-center justify-center'>
        <span className='loading loading-spinner loading-lg'></span>
      </div>
    );
  }

  return (
    <HostValtContext.Provider value={valt}>
      <div className='Runs bg-base-100/95 flex-1 relative flex flex-col overflow-hidden'>
        {/* Top TeamStatusBar */}
        <div className='p-4 border-b border-base-300'>
          <TeamStatusBar />
        </div>

        {/* Main content split */}
        <div className='flex-1 flex overflow-hidden'>
          {/* Left: Navigator (30%) */}
          <div className='w-[30%] border-r border-base-300 overflow-hidden'>
            <QuestionSlideNavigator />
          </div>

          {/* Right: Active Content (70%) */}
          <div className='flex-1 overflow-hidden'>
            <ActiveContentDisplay />
          </div>
        </div>

        {/* Control Footer */}
        <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between shadow-md-top border-t border-base-300'>
          <div className='flex gap-2 items-center'>
            {/* Status badges */}
            <span className={`badge ${statusBadges[snap.run.status as keyof typeof statusBadges]} badge-lg`}>
              {snap.run.status.replace('_', ' ').toUpperCase()}
            </span>

            {snap.run.status === 'paused' && <span className='badge badge-error badge-lg'>⏸ PAUSED</span>}

            {/* WebSocket connection status */}
            {snap.connectionState === 'connected' && (
              <span className='badge badge-success badge-sm'>🟢 Connected</span>
            )}
            {snap.connectionState === 'connecting' && (
              <span className='badge badge-warning badge-sm'>🟡 Connecting...</span>
            )}
            {snap.connectionState === 'closed' && snap.reconnectAttempts > 0 && (
              <>
                <span className='badge badge-error badge-sm'>🔴 Disconnected</span>
                {snap.reconnectAttempts >= snap.maxReconnectAttempts && (
                  <button className='btn btn-sm btn-warning' onClick={() => valt.manualReconnect()}>
                    Reconnect
                  </button>
                )}
              </>
            )}

            {/* Grace period display */}
            <div className='flex items-center gap-2'>
              <Icon name='clock' className='size-4' />
              <span className='text-sm'>Grace: {snap.run.gracePeriod}s</span>
              <button
                className='btn btn-xs btn-ghost'
                onClick={handleUpdateGracePeriod}
                disabled={snap.run.status === 'completed'}
              >
                <Icon name='pencil-square' className='size-3' />
              </button>
            </div>

            {/* Start/Complete/Reset buttons */}
            {snap.run.status === 'not_started' && (
              <button className='btn btn-success btn-sm' onClick={handleStartEvent}>
                <Icon name='play' className='size-4' />
                Start Event
              </button>
            )}
            {snap.run.status === 'completed' && (
              <button className='btn btn-warning btn-sm' onClick={handleResetEvent}>
                <Icon name='arrow-path' className='size-4' />
                Reset Event
              </button>
            )}
          </div>

          <div className='flex gap-2'>
            {/* Pause/Resume */}
            {snap.run.status === 'in_progress' && (
              <button className='btn btn-warning btn-sm' onClick={() => valt.pauseRun()}>
                ⏸
                Pause
              </button>
            )}
            {snap.run.status === 'paused' && (
              <button className='btn btn-success btn-sm' onClick={() => valt.resumeRun()}>
                <Icon name='play' className='size-4' />
                Resume
              </button>
            )}

            {/* Navigation */}
            <button
              className='btn btn-sm'
              onClick={() => valt.navigatePrevious()}
              disabled={snap.run.status !== 'in_progress' && snap.run.status !== 'paused'}
            >
              <Icon name='chevron-down' className='size-4 rotate-90' />
              Previous
            </button>
            <button
              className='btn btn-sm'
              onClick={() => valt.navigateNext()}
              disabled={snap.run.status !== 'in_progress' && snap.run.status !== 'paused'}
            >
              Next
              <Icon name='chevron-down' className='size-4 -rotate-90' />
            </button>

            {/* Show Answer (only during prompt phase) */}
            {snap.run.activeQuestion && (
              <button className='btn btn-primary btn-sm' onClick={() => valt.showAnswer()}>
                <Icon name='check' className='size-4' />
                Show Answer
              </button>
            )}

            {/* Complete Event */}
            {snap.run.status === 'in_progress' && (
              <button className='btn btn-error btn-sm' onClick={handleCompleteEvent}>
                <Icon name='stop' className='size-4' />
                Complete
              </button>
            )}
          </div>
        </footer>
      </div>
    </HostValtContext.Provider>
  );
}

Host.displayName = 'Host';
