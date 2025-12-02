import { RunValtContext } from '@/frontend/app/pages/runs/runValt';
import { useContext } from 'react';
import { useSnapshot } from 'valtio';

export const ActiveItem = () => {
  const runValt = useContext(RunValtContext);
  const snap = useSnapshot(runValt!.store);

  return (
    <pre className='absolute inset-0 p-4 text-base-100' style={{ whiteSpace: 'pre' }}>
      {JSON.stringify(snap.run.activeItem, null, 2)}
    </pre>
  );
};
