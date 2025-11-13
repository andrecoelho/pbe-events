import { memo, useMemo } from 'react';

const init = () => {
  const socket = new WebSocket('ws://localhost:3000/event-run/ws');

  socket.addEventListener('message', (event) => {
    console.log(event.data);
  });

  socket.addEventListener('open', () => {
    console.log('WebSocket connection established');

    socket.send('Hello Server!');
  });
};

export const RunHost = memo(() => {
  useMemo(init, []);

  return <div className='bg-base-100/95 flex-1 relative flex flex-col overflow-auto'></div>;
});
