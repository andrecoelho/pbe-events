import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { useAppValt } from '@/frontend/app/appValt';
import { memo, useMemo, useRef, useState } from 'react';
import { useSnapshot } from 'valtio';
import { SettingsValt, SettingsValtContext } from './settingsValt';
import './Settings.css';

const init = () => {
  const valt = new SettingsValt();

  valt.init().then((result) => {
    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  });

  return valt;
};

export const Settings = memo(() => {
  const valt = useMemo(init, []);
  const snap = useSnapshot(valt.store);
  const appValt = useAppValt();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formInitialized, setFormInitialized] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form values when user data loads
  if (snap.initialized && snap.user && !formInitialized) {
    setEmail(snap.user.email);
    setFirstName(snap.user.firstName);
    setLastName(snap.user.lastName);
    setFormInitialized(true);
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      toast.show({ message: 'All fields are required', type: 'error' });
      return;
    }

    const result = await valt.updateProfile({ email, firstName, lastName });

    if (result.ok) {
      toast.show({ message: 'Profile updated successfully', type: 'success' });
      // Update app valt user data
      if (appValt.store.user) {
        appValt.store.user.email = email;
        appValt.store.user.firstName = firstName;
        appValt.store.user.lastName = lastName;
      }
    } else {
      toast.show({ message: result.error, type: 'error' });
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.show({ message: 'All password fields are required', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.show({ message: 'New passwords do not match', type: 'error' });
      return;
    }

    if (newPassword.length < 8) {
      toast.show({ message: 'New password must be at least 8 characters', type: 'error' });
      return;
    }

    const result = await valt.updatePassword({ currentPassword, newPassword });

    if (result.ok) {
      toast.show({ message: 'Password updated successfully', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast.show({ message: result.error, type: 'error' });
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await valt.uploadAvatar(file);

    if (result.ok) {
      toast.show({ message: 'Avatar updated successfully', type: 'success' });
      // Update app valt avatar
      if (appValt.store.user && valt.store.user) {
        appValt.store.user.avatarUrl = valt.store.user.avatarUrl;
      }
    } else {
      toast.show({ message: result.error, type: 'error' });
    }

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleDeleteAvatar = async () => {
    const result = await valt.deleteAvatar();

    if (result.ok) {
      toast.show({ message: 'Avatar removed', type: 'success' });
      // Update app valt avatar
      if (appValt.store.user) {
        appValt.store.user.avatarUrl = undefined;
      }
    } else {
      toast.show({ message: result.error, type: 'error' });
    }
  };

  if (!snap.initialized) {
    return (
      <div className='Settings'>
        <div className='Settings__loading'>
          <span className='loading loading-spinner loading-lg' />
        </div>
      </div>
    );
  }

  const initials = snap.user
    ? `${snap.user.firstName.charAt(0)}${snap.user.lastName.charAt(0)}`.toUpperCase()
    : '';

  return (
    <SettingsValtContext.Provider value={valt}>
      <div className='Settings'>
        <div className='Settings__content'>
          <h1 className='Settings__title'>Account Settings</h1>

          {/* Avatar Section */}
          <div className='Settings__section'>
            <h2 className='Settings__section-title'>Profile Picture</h2>
            <div className='Settings__avatar-section'>
              <div className='Settings__avatar-container'>
                {snap.user?.avatarUrl ? (
                  <div className='avatar'>
                    <div className='w-24 rounded-full'>
                      <img src={snap.user.avatarUrl} alt='Profile' />
                    </div>
                  </div>
                ) : (
                  <div className='avatar avatar-placeholder'>
                    <div className='bg-neutral text-neutral-content w-24 rounded-full'>
                      <span className='text-2xl'>{initials}</span>
                    </div>
                  </div>
                )}
                {snap.uploadingAvatar && (
                  <div className='Settings__avatar-overlay'>
                    <span className='loading loading-spinner loading-md' />
                  </div>
                )}
              </div>
              <div className='Settings__avatar-actions'>
                <button
                  type='button'
                  className='btn btn-secondary btn-sm'
                  onClick={handleAvatarClick}
                  disabled={snap.uploadingAvatar}
                >
                  <Icon name='camera' className='size-4' />
                  Upload Photo
                </button>
                {snap.user?.avatarUrl && (
                  <button
                    type='button'
                    className='btn btn-ghost btn-sm text-error'
                    onClick={handleDeleteAvatar}
                    disabled={snap.uploadingAvatar}
                  >
                    <Icon name='trash' className='size-4' />
                    Remove
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/jpeg,image/png,image/webp,image/gif'
                  onChange={handleFileChange}
                  className='hidden'
                />
              </div>
            </div>
          </div>

          {/* Profile Section */}
          <div className='Settings__section'>
            <h2 className='Settings__section-title'>Profile Information</h2>
            <form onSubmit={handleProfileSubmit} className='Settings__form'>
              <label className='form-control w-full'>
                <div className='label'>
                  <span className='label-text'>Email</span>
                </div>
                <input
                  type='email'
                  className='input input-bordered w-full'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <div className='Settings__form-row'>
                <label className='form-control flex-1'>
                  <div className='label'>
                    <span className='label-text'>First Name</span>
                  </div>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </label>

                <label className='form-control flex-1'>
                  <div className='label'>
                    <span className='label-text'>Last Name</span>
                  </div>
                  <input
                    type='text'
                    className='input input-bordered w-full'
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className='Settings__form-actions'>
                <button type='submit' className='btn btn-primary' disabled={snap.saving}>
                  {snap.saving ? <span className='loading loading-spinner loading-sm' /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Password Section */}
          <div className='Settings__section'>
            <h2 className='Settings__section-title'>Change Password</h2>
            <form onSubmit={handlePasswordSubmit} className='Settings__form'>
              <label className='form-control w-full'>
                <div className='label'>
                  <span className='label-text'>Current Password</span>
                </div>
                <input
                  type='password'
                  className='input input-bordered w-full'
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>

              <label className='form-control w-full'>
                <div className='label'>
                  <span className='label-text'>New Password</span>
                </div>
                <input
                  type='password'
                  className='input input-bordered w-full'
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder='At least 8 characters'
                  required
                />
              </label>

              <label className='form-control w-full'>
                <div className='label'>
                  <span className='label-text'>Confirm New Password</span>
                </div>
                <input
                  type='password'
                  className='input input-bordered w-full'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </label>

              <div className='Settings__form-actions'>
                <button type='submit' className='btn btn-primary' disabled={snap.saving}>
                  {snap.saving ? <span className='loading loading-spinner loading-sm' /> : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </SettingsValtContext.Provider>
  );
});

Settings.displayName = 'Settings';
