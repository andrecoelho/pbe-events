import logo from '@/assets/PBE-logo_600px.png';
import { api } from '@/frontend/utils/api';
import { useState, type FormEvent } from 'react';

// Setting a new password with a one-time link from an administrator (#58): /reset-password/<token>.
export function ResetPassword({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const password = form.get('password') as string;

    if (password !== form.get('confirm')) {
      setError('The two passwords don’t match.');
      return;
    }

    setSaving(true);

    const result = await api('/api/password-reset', { method: 'POST', json: { token, password } });

    setSaving(false);

    if (result.ok) {
      setDone(true);
    } else {
      setError(result.error);
    }
  };

  return (
    <div className='absolute inset-0 flex justify-center items-center'>
      <div className='card card-side shadow-md overflow-hidden'>
        <div className='card-body p-12 glass'>
          <img src={logo} className='w-96 h-64' />
        </div>
        <div className='card-body bg-base-300 justify-center p-12 rounded-r-lg w-md'>
          <h1 className='card-title text-2xl mb-4'>Set a new password</h1>
          {done ? (
            <>
              <p>Your password is changed, and you’ve been signed out everywhere.</p>
              <a className='btn btn-primary mt-4' href='/'>
                Sign in
              </a>
            </>
          ) : (
            <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
              <label className='floating-label'>
                <span>New password</span>
                <input
                  type='password'
                  name='password'
                  className='input w-full'
                  placeholder='New password'
                  minLength={8}
                  autoComplete='new-password'
                  required
                />
              </label>
              <label className='floating-label'>
                <span>Repeat it</span>
                <input
                  type='password'
                  name='confirm'
                  className='input w-full'
                  placeholder='Repeat it'
                  autoComplete='new-password'
                  required
                />
              </label>
              <p className='text-sm text-base-content/70'>At least 8 characters. The link works once.</p>
              {error && (
                <div role='alert' className='alert alert-error'>
                  {error}
                </div>
              )}
              <button type='submit' className='btn btn-primary' disabled={saving}>
                {saving ? 'Saving…' : 'Set password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

ResetPassword.displayName = 'ResetPassword';
