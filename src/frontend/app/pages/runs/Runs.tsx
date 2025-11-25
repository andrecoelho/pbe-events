import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Runs.css';
import { gracePeriodModal } from './GracePeriodModal';
import { RunsValt } from './runsValt';

const init = () => {
  const valt = new RunsValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/runs\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    valt.init(eventId).then((result) => {
      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    });
  }

  const handleAddRun = async () => {
    const result = await valt.createRun(2);

    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  };

  const handleStartRun = async (run: { id: string; status: string }) => {
    const confirmation = await confirmModal.open('Are you sure you want to start this run?');

    if (confirmation) {
      const result = await valt.startRun(run.id);

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  const handleCompleteRun = async (run: { id: string }) => {
    const confirmation = await confirmModal.open('Are you sure you want to complete this run?');

    if (confirmation) {
      const result = await valt.completeRun(run.id);

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  const handleUpdateGracePeriod = async (run: { id: string; gracePeriod: number }) => {
    await gracePeriodModal.open(valt, run.id, run.gracePeriod);
  };

  const handleHostRun = (run: { id: string }) => {
    // TODO: Navigate to host interface when implemented
    toast.show({ message: 'Host interface not yet implemented', type: 'info' });
  };

  const handleViewResults = (run: { id: string }) => {
    // TODO: Navigate to results page when implemented
    toast.show({ message: 'Results view not yet implemented', type: 'info' });
  };

  const handleDeleteRun = async (run: { id: string }) => {
    const confirmation = await confirmModal.open(
      'Are you sure you want to delete this run? This action cannot be undone.'
    );

    if (confirmation) {
      const result = await valt.deleteRun(run.id);

      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    }
  };

  return {
    valt,
    handleAddRun,
    handleStartRun,
    handleCompleteRun,
    handleUpdateGracePeriod,
    handleHostRun,
    handleViewResults,
    handleDeleteRun
  };
};

const statusBadges = {
  not_started: 'badge-warning',
  in_progress: 'badge-info',
  completed: 'badge-success'
} as const;

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString();
};

export function Runs() {
  const {
    valt,
    handleAddRun,
    handleStartRun,
    handleCompleteRun,
    handleUpdateGracePeriod,
    handleHostRun,
    handleViewResults,
    handleDeleteRun
  } = useMemo(init, []);
  const snap = useSnapshot(valt.store);

  useEffect(() => {
    return () => {
      // Cleanup if needed
    };
  }, [valt]);

  return (
    <div className='Runs bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Runs</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
        <div className='overflow-x-auto'>
          <table className='table'>
            <thead>
              <tr>
                <th className='col-date'>Started</th>
                <th className='col-question'>Active Question</th>
                <th className='col-grace'>Grace Period</th>
                <th className='col-status'>Status</th>
                <th className='col-actions'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {snap.runs.map((run) => (
                <tr key={run.id}>
                  <td className='col-date'>{formatDateTime(run.startedAt)}</td>
                  <td className='col-question'>
                    {run.activeQuestionNumber ? `Question ${run.activeQuestionNumber}` : '—'}
                  </td>
                  <td className='col-grace'>{run.gracePeriod} seconds</td>
                  <td className='col-status'>
                    <span className={`badge ${statusBadges[run.status]}`}>{run.status.replace('_', ' ')}</span>
                  </td>
                  <td className='col-actions'>
                    {run.status === 'not_started' && (
                      <button
                        className='tooltip tooltip-neutral'
                        data-tip='Start Run'
                        onClick={() => handleStartRun(run)}
                        aria-label='Start run'
                      >
                        <Icon name='play' className='text-success cursor-pointer hover:brightness-75' />
                      </button>
                    )}
                    {run.status === 'in_progress' && (
                      <>
                        <button
                          className='tooltip tooltip-neutral'
                          data-tip='End Run'
                          onClick={() => handleCompleteRun(run)}
                          aria-label='End run'
                        >
                          <Icon name='stop' className='text-success cursor-pointer hover:brightness-75' />
                        </button>
                        <button className='tooltip tooltip-neutral' data-tip='Host Run' aria-label='Host run' disabled>
                          <Icon
                            name='presentation-chart-bar'
                            className='text-info cursor-pointer hover:brightness-75 opacity-20'
                          />
                        </button>
                      </>
                    )}
                    {run.status !== 'completed' && (
                      <button
                        className='tooltip tooltip-neutral'
                        data-tip='Update Grace Period'
                        onClick={() => handleUpdateGracePeriod(run)}
                        aria-label='Update grace period'
                      >
                        <Icon name='clock' className='text-accent cursor-pointer hover:brightness-75' />
                      </button>
                    )}
                    {run.status === 'completed' && (
                      <button
                        className='tooltip tooltip-neutral'
                        data-tip='View Results'
                        aria-label='View results'
                        disabled
                      >
                        <Icon name='chart-bar' className='text-cyan-600 cursor-not-allowed opacity-20' />
                      </button>
                    )}
                    {run.status !== 'in_progress' && (
                      <button
                        className='tooltip tooltip-neutral'
                        data-tip='Delete Run'
                        onClick={() => handleDeleteRun(run)}
                        aria-label='Delete run'
                      >
                        <Icon name='trash' className='text-error cursor-pointer hover:brightness-75' />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary' disabled={!snap.initialized || valt.hasActiveRun} onClick={handleAddRun}>
          <Icon name='plus' className='size-4' />
          Add Run
        </button>
      </footer>
    </div>
  );
}

Runs.displayName = 'Runs';
