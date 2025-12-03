import logo from 'src/assets/favicon.svg';
import type { Snapshot } from 'valtio';

export const Slide = ({
  item
}: {
  item: Snapshot<{
    type: 'slide';
    number: number;
    content: string;
  }>;
}) => {
  const x = item.content.length;
  const fontSize = Math.floor(0.000266 * x * x - 0.23307 * x + 65.2201);

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 p-8'>
      <div className='flex justify-center'>
        <img src={logo} className='h-28' />
      </div>
      <div
        className='flex flex-1 items-center justify-center text-center font-serif whitespace-pre-wrap'
        style={{ fontSize: `${fontSize}px` }}
      >
        {item.content}
      </div>
    </div>
  );
};

Slide.displayName = 'Slide';
