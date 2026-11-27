// A team badge's menu on the Run screen (#44): the team's join code, copying its join link, releasing the
// device that joined (the team moves computers) and making a new code (the old link stops working).
import type { TeamStatus } from '@/frontend/app/pages/runs/runValt';
import { useRunValt } from '@/frontend/app/pages/runs/runValt';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { formatJoinCode, joinLink } from '@/joinCode';
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  team: TeamStatus;
  // The badge, which opens the menu.
  children: ReactNode;
}

export function TeamMenu({ team, children }: Props) {
  const valt = useRunValt();
  const popoverId = `team-menu-${team.id}`;
  const anchorName = `--team-menu-${team.id}`;
  const label = `Team ${team.number}`;

  const close = () => document.getElementById(popoverId)?.hidePopover();

  const handleCopyLink = async () => {
    close();

    try {
      await navigator.clipboard.writeText(joinLink(window.location.origin, team.joinCode));
      toast.show({ type: 'success', message: `Copied ${label}’s join link.` });
    } catch {
      toast.show({ type: 'error', message: 'Could not copy the link.' });
    }
  };

  const handleRelease = async () => {
    close();

    const confirmed = await confirmModal.open(
      `Release ${label}’s device? It will be disconnected, and the team can join again on any device with its code.`
    );

    if (confirmed && !(await valt.releaseTeamDevice(team.id))) {
      toast.show({ type: 'error', message: `Could not release ${label}’s device.` });
    }
  };

  const handleNewCode = async () => {
    close();

    const confirmed = await confirmModal.open(
      `Make a new code for ${label}? The old code and link will stop working. A device that already joined stays connected.`
    );

    if (confirmed && !(await valt.renewJoinCode(team.id))) {
      toast.show({ type: 'error', message: `Could not make a new code for ${label}.` });
    }
  };

  return (
    <>
      <button
        className='relative inline-flex cursor-pointer'
        popoverTarget={popoverId}
        style={{ anchorName } as CSSProperties}
        aria-label={`${label} options`}
      >
        {children}
      </button>
      <ul
        className='dropdown menu w-64 rounded-box bg-base-100 shadow-lg'
        popover='auto'
        id={popoverId}
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        <li className='menu-title'>
          <span>
            {label}: {team.name}
          </span>
          <span className='font-mono text-lg text-base-content tracking-widest'>{formatJoinCode(team.joinCode)}</span>
          <span className='font-normal'>{team.hasDevice ? 'A device has joined' : 'No device has joined yet'}</span>
        </li>
        <li>
          <button onClick={handleCopyLink}>
            <Icon name='link' className='size-4' />
            Copy join link
          </button>
        </li>
        <li className={team.hasDevice ? '' : 'menu-disabled'}>
          <button onClick={handleRelease} disabled={!team.hasDevice}>
            <Icon name='signal-slash' className='size-4' />
            Release device
          </button>
        </li>
        <li>
          <button onClick={handleNewCode}>
            <Icon name='key' className='size-4' />
            New code
          </button>
        </li>
      </ul>
    </>
  );
}
