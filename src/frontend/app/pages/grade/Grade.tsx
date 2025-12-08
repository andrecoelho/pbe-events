import { GradeValt } from '@/frontend/app/pages/grade/gradeValt';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';

const init = () => {
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/grade\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;
  const gradeValt = new GradeValt();

  if (eventId) {
    gradeValt.init(eventId);
  }

  return { gradeValt };
};

export const Grade = () => {
  const { gradeValt } = useMemo(init, []);
  const snap = useSnapshot(gradeValt.store);

  useEffect(() => () => gradeValt.cleanup(), [gradeValt]);

  return (
    <div className='bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8 place-items-center'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Grade Event</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
      </div>
    </div>
  );
};
