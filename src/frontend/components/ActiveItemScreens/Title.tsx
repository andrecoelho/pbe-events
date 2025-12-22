import logo from 'src/assets/PBE-logo_600px.png';
import type { Snapshot } from 'valtio';

export const Title = ({
  item
}: {
  item: Snapshot<{
    type: 'title';
    title: string;
    remarks: string | null;
  }>;
}) => {
  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 p-8'>
      <div className='flex justify-center'>
        <img src={logo} className='h-28' />
      </div>
      <h1 className='text-6xl font-serif font-bold text-center'>{item.title}</h1>
      {item.remarks && <div className='text-2xl font-serif text-center whitespace-pre-wrap'>{item.remarks}</div>}
    </div>
  );
};

Title.displayName = 'Title';
