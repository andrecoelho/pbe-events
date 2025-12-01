import { memo } from 'react';

interface User {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

interface AvatarProps {
  user: User;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6',
  sm: 'w-8',
  md: 'w-10',
  lg: 'w-12'
};

const textSizeClasses = {
  xs: 'text-xs',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base'
};

export const Avatar = memo(({ user, size = 'md', className = '' }: AvatarProps) => {
  const sizeClass = sizeClasses[size];
  const textSizeClass = textSizeClasses[size];
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  if (user.avatarUrl) {
    return (
      <div className={`avatar ${className}`}>
        <div className={`${sizeClass} rounded-full`}>
          <img src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={`avatar avatar-placeholder ${className}`}>
      <div className={`bg-neutral text-neutral-content ${sizeClass} rounded-full`}>
        <span className={textSizeClass}>{initials}</span>
      </div>
    </div>
  );
});

Avatar.displayName = 'Avatar';
