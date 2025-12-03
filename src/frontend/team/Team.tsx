import { TeamActiveItemScreen } from '@/frontend/team/TeamActiveItemScreen';
import { TeamValt, TeamValtContext } from '@/frontend/team/teamValt';
import { useEffect, useMemo, useState } from 'react';
import logo from 'src/assets/favicon.svg';
import '../base.css';
import { useSnapshot } from 'valtio';

const init = () => {
  const url = new URL(window.location.href);
  const eventId = url.searchParams.get('eventId');
  const teamId = url.searchParams.get('teamId');

  const valt = new TeamValt();

  valt.init(eventId, teamId).catch((error) => {
    console.error('Failed to initialize TeamValt:', error);
  });

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const selectedLanguageId = formData.get('language') as string;

    valt.selectLanguage(selectedLanguageId);
  };

  return { valt, handleFormSubmit };
};

export const Team = () => {
  const { valt, handleFormSubmit } = useMemo(init, []);
  const snap = useSnapshot(valt.store);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calculateScale = () => {
      const baseWidth = 800;
      const baseHeight = 600;
      const scaleX = window.innerWidth / baseWidth;
      const scaleY = window.innerHeight / baseHeight;

      setScale(Math.min(scaleX, scaleY));
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);

    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  if (!valt) {
    return <div className='alert alert-error'>Initialization error. Check console for details.</div>;
  }

  if (!snap.team?.languageId && snap.languages) {
    return (
      <div className='absolute inset-0 flex flex-col text-base-100 gap-8 p-8 items-center justify-center'>
        <div className='card text-base-content shadow-xl overflow-hidden'>
          <div className='card-body glass flex place-items-center'>
            <img src={logo} className='w-64' />
          </div>
          <div className='card-body bg-base-100'>
            <h1 className='text-2xl font-bold text-center'>PATHFINDER BIBLE EXPERIENCE</h1>
            <h2 className='text-xl opacity-80'>
              <span className='font-bold'>Event:</span> {snap.event?.name}
            </h2>
            <h2 className='text-xl opacity-80'>
              <span className='font-bold'>Team:</span>
              <span className='relative inline-flex ml-3 align-middle'>
                <span className='size-8 rounded-xl text-base-100 text-lg font-semibold flex items-center justify-center bg-gradient-to-br shadow-inner ring-1 ring-accent/30 ring-offset-1 ring-offset-base-100 from-info via-sky-500 to-indigo-500'>
                  {snap.team?.number.toString().padStart(2, '0')}
                </span>
              </span>
              &nbsp;
              {snap.team?.name}
            </h2>
            <form onSubmit={handleFormSubmit}>
              <fieldset className='w-full border-1 border-neutral rounded-md p-4 mt-4'>
                <p className='text-sm opacity-70 mb-4'>Choose the language you want to use for this event.</p>
                <select name='language' className='select select-bordered w-full' defaultValue=''>
                  <option value='' disabled>
                    Choose a language
                  </option>
                  {Object.values(snap.languages ?? {}).map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.code} - {language.name}
                    </option>
                  ))}
                </select>
                <button type='submit' className='btn btn-primary w-full mt-4'>
                  Confirm Language
                </button>
              </fieldset>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (snap.team?.languageId && snap.languages) {
    return (
      <TeamValtContext.Provider value={valt}>
        <div className='fixed inset-0 flex justify-center items-center bg-primary'>
          <div
            className='absolute w-200 h-150'
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              left: '50%',
              top: '50%',
              marginLeft: '-400px',
              marginTop: '-300px'
            }}
          >
            <img src={logo} className='absolute w-200 opacity-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
            <TeamActiveItemScreen />
          </div>
          <div className='absolute bottom-8 right-8 text-sm opacity-50 flex flex-col text-base-100'>
            <div>
              <span className='font-bold'>Event:</span> {snap.event?.name}
            </div>
            <div>
              <span className='font-bold'>Team:</span> {snap.team?.number.toString().padStart(2, '0')} &mdash;{' '}
              {snap.team?.name}
            </div>
            <div>
              <span className='font-bold'>Language:</span> {snap.languages[snap.team.languageCode!]?.name}
            </div>
          </div>
        </div>
      </TeamValtContext.Provider>
    );
  }
};

Team.displayName = 'Team';
