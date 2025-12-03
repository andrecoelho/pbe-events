import logo from 'src/assets/favicon.svg';

export const Completed = () => {
  return (
    <div className='absolute inset-0 flex flex-col items-center justify-center text-base-100 gap-8 px-10'>
      <img src={logo} className='h-28' />
      <h1 className='text-5xl text-center'>
        The event is completed.
        <br />
        Thank you!
      </h1>
    </div>
  );
};

Completed.displayName = 'Completed';
