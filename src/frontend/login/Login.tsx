import '../base.css';

import logo from 'src/assets/PBE-logo_600px.png';
import { alertModal } from '../components/AlertModal';
import { modal } from '../components/Modal';
import { CreateAccountModal } from './CreateAccountModal';

export function Login() {
  const handleCreateAccount = () => {
    modal.open(<CreateAccountModal />);
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const result = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    try {
      if (result.status === 200) {
        location.reload();
      } else {
        const response = await result.json();

        alertModal.open(response.error || 'Login failed');
      }
    } catch {
      alertModal.open('Login failed');
    }
  };

  return (
    <div className='absolute inset-0 flex justify-center items-center'>
      <div className='card card-side shadow-md overflow-hidden'>
        <div className='card-body p-12 glass'>
          <img src={logo} className='w-96 h-64' />
        </div>
        <div className='card-body bg-base-300 place-items-center justify-center p-12 rounded-r-lg'>
          <h1 className='card-title text-2xl mb-8'>PBE Events Login</h1>
          <form onSubmit={handleSubmit} className='grid gap-4 max-w-sm mx-auto'>
            <label className='contents'>
              <span className='self-center text-right'>Email:</span>
              <input type='email' name='email' className='input bg-base-300' required />
            </label>

            <label className='contents'>
              <span className='self-center text-right'>Password:</span>
              <input type='password' name='password' className='input bg-base-300' required />
            </label>

            <div className='col-span-2'>
              <button type='submit' className='btn btn-primary w-full'>
                Login
              </button>
            </div>

            <div className='col-span-2 text-center'>
              <button type='button' className='link link-hover text-sm' onClick={handleCreateAccount}>
                Don't have an account? Create one
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

Login.displayName = 'Login';
