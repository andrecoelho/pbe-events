// Where a team joins its event (#44): typing the team's code at /join, or opening the link /join/K7P4QX.
// The server remembers this device in a cookie, then the team screen opens.
import { Icon } from '@/frontend/components/Icon';
import { formatJoinCode, normalizeJoinCode } from '@/joinCode';
import logo from '@/assets/PBE-logo_600px.png';
import { useEffect, useRef, useState } from 'react';
import '../base.css';

type JoinResult = { ok: true } | { ok: false; error: string };

async function join(code: string): Promise<JoinResult> {
  try {
    const response = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (response.ok) {
      return { ok: true };
    }

    const body = (await response.json().catch(() => ({}))) as { error?: string };

    return { ok: false, error: body.error ?? 'Could not join. Try again.' };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your internet connection and try again.' };
  }
}

// The code in a /join/K7P4QX link, as the person would type it.
function codeFromPath() {
  const code = normalizeJoinCode(decodeURIComponent(window.location.pathname.split('/')[2] ?? ''));

  return code ? formatJoinCode(code) : '';
}

export const Join = () => {
  const [code, setCode] = useState(codeFromPath);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoJoined = useRef(false);

  const submit = async (value: string) => {
    setJoining(true);
    setError('');

    const result = await join(value);

    if (result.ok) {
      window.location.replace('/event-run/team');
      return;
    }

    setJoining(false);
    setError(result.error);
    inputRef.current?.focus();
  };

  // A /join/K7P4QX link joins straight away.
  useEffect(() => {
    const linkCode = codeFromPath();

    if (linkCode && !autoJoined.current) {
      autoJoined.current = true;
      void submit(linkCode);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(code);
  };

  return (
    <div className='fixed inset-0 flex justify-center items-center bg-primary p-4'>
      <form className='card bg-base-100 shadow-xl w-full max-w-md' onSubmit={handleSubmit}>
        <div className='card-body items-center text-center gap-4'>
          <img src={logo} className='h-24' alt='Pathfinder Bible Experience' />
          <h1 className='card-title text-2xl'>Join your team</h1>
          <p className='text-base-content/70'>Enter the team code from your host.</p>
          <input
            ref={inputRef}
            className='input input-lg w-full text-center font-mono text-3xl tracking-widest uppercase'
            aria-label='Team code'
            placeholder='K7P-4QX'
            autoFocus
            autoComplete='off'
            autoCapitalize='characters'
            spellCheck={false}
            maxLength={8}
            value={code}
            disabled={joining}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          {error && (
            <div role='alert' className='alert alert-error alert-soft w-full text-left'>
              <Icon name='x-circle' className='size-5' />
              <span>{error}</span>
            </div>
          )}
          <button className='btn btn-primary btn-lg w-full' disabled={joining || !code.trim()}>
            {joining ? <span className='loading loading-spinner' /> : 'Join'}
          </button>
        </div>
      </form>
    </div>
  );
};

Join.displayName = 'Join';
