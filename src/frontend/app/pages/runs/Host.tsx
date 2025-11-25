import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Runs.css';
import { HostValt } from '@/frontend/app/pages/runs/hostValt';
import { gracePeriodModal } from '@/frontend/app/pages/runs/GracePeriodModal';

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
  completed: 'badge-success'
} as const;

export function Host() {
  const { valt, handleStartEvent, handleCompleteEvent, handleUpdateGracePeriod, handleResetEvent } = useMemo(init, []);
  const snap = useSnapshot(valt.store);

  useEffect(() => {
    return () => {
      // Cleanup if needed
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
    <div className='Runs bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Host Event</h1>
        <h2 className='text-2xl font-bold mb-6 text-center text-neutral brightness-75'>{snap.eventName}</h2>

        {/* Status Section */}
        <div className='card bg-base-200 shadow-xl mb-6'>
          <div className='card-body'>
            <h3 className='card-title'>Event Status</h3>
            <div className='flex items-center gap-4'>
              <span className={`badge ${statusBadges[snap.run.status as keyof typeof statusBadges]} badge-lg`}>
                {snap.run.status.replace('_', ' ').toUpperCase()}
              </span>
              <div className='flex items-center gap-2'>
                <Icon name='clock' className='size-4' />
                <span>Grace Period: {snap.run.gracePeriod} seconds</span>
              </div>
              <button
                className='btn btn-sm btn-ghost gap-2'
                onClick={handleUpdateGracePeriod}
                disabled={snap.run.status === 'completed'}
              >
                <Icon name='pencil-square' className='size-4' />
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Active Question Section */}
        {snap.run.activeType === 'question' && snap.run.activeQuestion && (
          <div className='card bg-base-200 shadow-xl mb-6'>
            <div className='card-body'>
              <h3 className='card-title'>Active Question</h3>
              <div className='flex items-center gap-4'>
                <div className='badge badge-primary badge-lg'>Question {snap.run.activeQuestion.number}</div>
                <div className='flex items-center gap-2'>
                  <Icon name='clock' className='size-4' />
                  <span>{snap.run.activeQuestion.seconds} seconds</span>
                </div>
                <div className='flex items-center gap-2'>
                  <span>{snap.run.activeQuestion.maxPoints} points</span>
                </div>
                <div className='badge badge-outline'>{snap.run.activeQuestion.type}</div>
              </div>
            </div>
          </div>
        )}

        {/* Active Slide Section */}
        {snap.run.activeType === 'slide' && snap.run.activeSlide && (
          <div className='card bg-base-200 shadow-xl mb-6'>
            <div className='card-body'>
              <h3 className='card-title'>Active Slide</h3>
              <div className='flex items-center gap-4'>
                <div className='badge badge-secondary badge-lg'>Slide {snap.run.activeSlide.number}</div>
                <div className='text-sm opacity-75'>Timer disabled for slides</div>
              </div>
              <div className='mt-4 p-4 bg-base-300 rounded-lg'>
                <div className='prose max-w-none'>{snap.run.activeSlide.content}</div>
              </div>
            </div>
          </div>
        )}

        {/* Placeholder for future features */}
        <div className='alert alert-info'>
          <div>
            <h4 className='font-bold'>Coming Soon</h4>
            <div className='text-sm'>
              Question navigation, slide controls, and real-time team status will be added here.
            </div>
          </div>
        </div>
      </div>

      {/* Control Footer */}
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-between shadow-md-top'>
        <div className='flex gap-2'>
          {snap.run.status === 'not_started' && (
            <button className='btn btn-success' onClick={handleStartEvent}>
              <Icon name='play' className='size-4' />
              Start Event
            </button>
          )}
          {snap.run.status === 'in_progress' && (
            <button className='btn btn-error' onClick={handleCompleteEvent}>
              <Icon name='stop' className='size-4' />
              Complete Event
            </button>
          )}
          {snap.run.status === 'completed' && (
            <button className='btn btn-warning' onClick={handleResetEvent}>
              <Icon name='arrow-path' className='size-4' />
              Reset Event
            </button>
          )}
        </div>
        <div className='flex gap-2'>
          <button className='btn btn-ghost' disabled>
            Previous
          </button>
          <button className='btn btn-ghost' disabled>
            Next
          </button>
          <button className='btn btn-primary' disabled>
            Open for Answers
          </button>
        </div>
      </footer>
    </div>
  );
}

Host.displayName = 'Host';
