import { RunValt } from '@/frontend/app/pages/runs/runValt';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';

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
    const result = await valt.startRun();

    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  };

  const handlePauseEvent = async () => {
    const result = await valt.pauseRun();

    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  };

  const handleCompleteEvent = async () => {
    const result = await valt.completeRun();

    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  };

  const handleResetEvent = async () => {
    const result = await valt.resetRun();

    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  };

  return { valt, handleStartEvent, handlePauseEvent, handleCompleteEvent, handleResetEvent };
};

export const Run = () => {
  const { valt, handleStartEvent, handlePauseEvent, handleCompleteEvent, handleResetEvent } = useMemo(() => init(), []);
  const snap = useSnapshot(valt.store);

  return (
    <div className='bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Run</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
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
            <button className='btn btn-success' onClick={handleStartEvent}>
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
          {snap.run.status === 'in_progress' && (
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
