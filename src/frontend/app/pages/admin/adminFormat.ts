// Labels and formatting shared by the admin page's sections.
import type { LiveConnectionRole, RunStatus, TeamConnectionStatus } from '@/types';

export const ROLE_LABELS: Record<LiveConnectionRole, [singular: string, plural: string]> = {
  host: ['host', 'hosts'],
  presenter: ['presenter', 'presenters'],
  judge: ['judge', 'judges'],
  results: ['results screen', 'results screens'],
  team: ['team', 'teams']
};

export const ROLE_BADGES: Record<LiveConnectionRole, string> = {
  host: 'badge-primary',
  presenter: 'badge-secondary',
  judge: 'badge-accent',
  results: 'badge-info',
  team: 'badge-neutral'
};

export const RUN_STATUS: Record<RunStatus, [label: string, badge: string]> = {
  not_started: ['Not started', 'badge-ghost'],
  in_progress: ['In progress', 'badge-success'],
  paused: ['Paused', 'badge-warning'],
  completed: ['Completed', 'badge-neutral']
};

export const TEAM_STATUS: Record<TeamConnectionStatus, [label: string, status: string]> = {
  connected: ['Connected', 'status-success'],
  reconnecting: ['Reconnecting', 'status-warning'],
  offline: ['Offline', 'status-neutral']
};

// "12 s", "4 min", "2 h 5 min".
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));

  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

// "3 s ago", or `never` when there's no time.
export const formatAgo = (serverTime: number, time: number | null, never = 'None yet') =>
  time === null ? never : `${formatDuration(serverTime - time)} ago`;

// "Nov 27, 2026", or with the time.
export const formatDate = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString(
    undefined,
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }
  );
