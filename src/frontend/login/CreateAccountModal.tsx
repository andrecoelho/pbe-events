import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { modal } from '../components/Modal';

export function CreateAccountModal() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Validation error states
  const [avatarError, setAvatarError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
      return;
    }

    // Validate file size (max 500KB)
    const maxSize = 500 * 1024;
    if (file.size > maxSize) {
      setAvatarError('File size must be less than 500KB');
      return;
    }

    setAvatarFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear all errors
    setEmailError('');
    setFirstNameError('');
    setLastNameError('');
    setPasswordError('');
    setConfirmPasswordError('');

    let hasError = false;

    if (!email.trim()) {
      setEmailError('Email is required');
      hasError = true;
    }

    if (!firstName.trim()) {
      setFirstNameError('First name is required');
      hasError = true;
    }

    if (!lastName.trim()) {
      setLastNameError('Last name is required');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      hasError = true;
    }

    if (hasError) return;

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append('email', email.trim());
      formData.append('firstName', firstName.trim());
      formData.append('lastName', lastName.trim());
      formData.append('password', password);

      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const response = await fetch('/api/signup', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        modal.close();
      } else {
        // Handle server-side validation errors
        if (result.error?.toLowerCase().includes('email')) {
          setEmailError(result.error);
        } else {
          setPasswordError(result.error || 'Failed to create account');
        }
      }
    } catch {
      setPasswordError('Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  const initials =
    firstName && lastName ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() : '';

  return (
    <div className='modal-box max-w-md'>
      <h3 className='font-bold text-lg mb-4'>Create Account</h3>

      <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
        {/* Avatar Section */}
        <fieldset className='flex flex-col gap-2'>
          <div className='flex items-center gap-4'>
            <div className='relative'>
              {avatarPreview ? (
                <div className='avatar'>
                  <div className='w-20 rounded-full'>
                    <img src={avatarPreview} alt='Profile preview' />
                  </div>
                </div>
              ) : (
                <div className='avatar avatar-placeholder'>
                  <div className='bg-neutral text-neutral-content w-20 rounded-full'>
                    <span className='text-xl'>{initials || '?'}</span>
                  </div>
                </div>
              )}
            </div>
            <div className='flex flex-col gap-2'>
              <button
                type='button'
                className='btn btn-secondary btn-sm'
                onClick={handleAvatarClick}
                disabled={saving}
              >
                <Icon name='camera' className='size-4' />
                {avatarPreview ? 'Change Photo' : 'Upload Photo'}
              </button>
              {avatarPreview && (
                <button
                  type='button'
                  className='btn btn-ghost btn-sm text-error'
                  onClick={handleRemoveAvatar}
                  disabled={saving}
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
          {avatarError && <p className='text-error text-sm'>{avatarError}</p>}
        </fieldset>

        {/* Email */}
        <fieldset className='form-control w-full'>
          <div className='label'>
            <span className='label-text'>Email</span>
          </div>
          <input
            type='email'
            className={`input input-bordered w-full ${emailError ? 'input-error' : ''}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError('');
            }}
            disabled={saving}
          />
          {emailError && <p className='text-error text-sm mt-1'>{emailError}</p>}
        </fieldset>

        {/* Name Fields */}
        <div className='flex gap-4'>
          <fieldset className='form-control flex-1'>
            <div className='label'>
              <span className='label-text'>First Name</span>
            </div>
            <input
              type='text'
              className={`input input-bordered w-full ${firstNameError ? 'input-error' : ''}`}
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setFirstNameError('');
              }}
              disabled={saving}
            />
            {firstNameError && <p className='text-error text-sm mt-1'>{firstNameError}</p>}
          </fieldset>

          <fieldset className='form-control flex-1'>
            <div className='label'>
              <span className='label-text'>Last Name</span>
            </div>
            <input
              type='text'
              className={`input input-bordered w-full ${lastNameError ? 'input-error' : ''}`}
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setLastNameError('');
              }}
              disabled={saving}
            />
            {lastNameError && <p className='text-error text-sm mt-1'>{lastNameError}</p>}
          </fieldset>
        </div>

        {/* Password */}
        <fieldset className='form-control w-full'>
          <div className='label'>
            <span className='label-text'>Password</span>
          </div>
          <input
            type='password'
            className={`input input-bordered w-full ${passwordError ? 'input-error' : ''}`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }}
            placeholder='At least 8 characters'
            disabled={saving}
          />
          {passwordError && <p className='text-error text-sm mt-1'>{passwordError}</p>}
        </fieldset>

        {/* Confirm Password */}
        <fieldset className='form-control w-full'>
          <div className='label'>
            <span className='label-text'>Confirm Password</span>
          </div>
          <input
            type='password'
            className={`input input-bordered w-full ${confirmPasswordError ? 'input-error' : ''}`}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setConfirmPasswordError('');
            }}
            disabled={saving}
          />
          {confirmPasswordError && <p className='text-error text-sm mt-1'>{confirmPasswordError}</p>}
        </fieldset>

        {/* Actions */}
        <div className='modal-action'>
          <button type='button' className='btn' onClick={() => modal.close()} disabled={saving}>
            Cancel
          </button>
          <button type='submit' className='btn btn-primary' disabled={saving}>
            {saving ? <span className='loading loading-spinner loading-sm' /> : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
}

CreateAccountModal.displayName = 'CreateAccountModal';
