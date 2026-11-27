import { useAppValt, type CurrentEvent } from '@/frontend/app/appValt';
import { EventLayout, MANAGERS, openPresenter } from '@/frontend/app/pages/event/EventLayout';
import { EventHomeValt, REFRESH_MS } from '@/frontend/app/pages/event/eventHomeValt';
import { alertModal } from '@/frontend/components/AlertModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { eventUrl } from '@/eventUrls';
import type { EventOverviewResponse, RunStatus } from '@/types';
import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { useSnapshot } from 'valtio';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type ItemState = 'ready' | 'missing' | 'warning' | 'optional';

interface Item {
  label: string;
  state: ItemState;
  detail: string;
  action: { label: string; href: string } | null;
}

// The setup checklist, from what the event has so far. Required items come first.
function checklist(eventId: string, counts: EventOverviewResponse['counts']): Item[] {
  const languages: Item =
    counts.languages > 0
      ? { label: 'Languages', state: 'ready', detail: String(counts.languages), action: null }
      : {
          label: 'Languages',
          state: 'missing',
          detail: 'None yet',
          action: { label: 'Add languages', href: eventUrl(eventId, 'languages') }
        };

  const questions: Item =
    counts.questions === 0
      ? {
          label: 'Questions',
          state: 'missing',
          detail: counts.languages === 0 ? 'None yet. Add a language first.' : 'None yet',
          action: counts.languages === 0 ? null : { label: 'Add questions', href: eventUrl(eventId, 'questions') }
        }
      : counts.questionsMissingTranslations > 0
        ? {
            label: 'Questions',
            state: 'warning',
            detail: `${plural(counts.questions, 'question')}, ${counts.questionsMissingTranslations} missing a translation`,
            action: { label: 'Translate', href: eventUrl(eventId, 'questions') }
          }
        : { label: 'Questions', state: 'ready', detail: String(counts.questions), action: null };

  const teams: Item =
    counts.teams > 0
      ? {
          label: 'Teams',
          state: 'ready',
          detail: `${counts.teams} (${counts.teamsJoined} joined)`,
          action: null
        }
      : {
          label: 'Teams',
          state: 'missing',
          detail: counts.languages === 0 ? 'None yet. Add a language first.' : 'None yet',
          action: counts.languages === 0 ? null : { label: 'Add teams', href: eventUrl(eventId, 'teams') }
        };

  const slides: Item = {
    label: 'Intro slides',
    state: counts.slides > 0 ? 'ready' : 'optional',
    detail: counts.slides > 0 ? String(counts.slides) : 'Optional',
    action: counts.slides > 0 ? null : { label: 'Add slides', href: eventUrl(eventId, 'slides') }
  };

  const judges: Item = {
    label: 'Judges',
    state: counts.judges > 0 ? 'ready' : 'optional',
    detail: counts.judges > 0 ? String(counts.judges) : 'Optional. Owners and admins can grade.',
    action: counts.judges > 0 ? null : { label: 'Invite judges', href: eventUrl(eventId, 'permissions') }
  };

  return [languages, questions, teams, slides, judges];
}

const STATE_ICON: Record<ItemState, ReactNode> = {
  ready: <Icon name='check' className='size-5 text-success' aria-label='Ready' />,
  missing: <Icon name='x-circle' className='size-5 text-error' aria-label='Missing' />,
  warning: <Icon name='exclamation-triangle' className='size-5 text-warning' aria-label='Needs attention' />,
  optional: <Icon name='information-circle' className='size-5 text-base-content/40' aria-label='Optional' />
};

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed'
};

const RunBadge = ({ runStatus, teamsConnected }: { runStatus: RunStatus; teamsConnected: number }) => {
  if (teamsConnected > 0) {
    return (
      <span className='badge badge-success gap-2'>
        <span className='status status-success animate-pulse bg-white' />
        Live now · {plural(teamsConnected, 'team')} connected
      </span>
    );
  }

  return runStatus === 'not_started' ? null : <span className='badge badge-ghost'>{RUN_STATUS_LABEL[runStatus]}</span>;
};

const ManagerHome = memo(({ event }: { event: CurrentEvent }) => {
  const valt = useMemo(() => new EventHomeValt(), []);
  const snap = useSnapshot(valt.store);

  useEffect(() => {
    valt.load(event.id);

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        valt.load(event.id);
      }
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [valt, event.id]);

  const handleCopyJoinCodes = async () => {
    const result = await valt.copyJoinCodes();

    if (result.ok) {
      toast.show({ type: 'success', message: 'Join codes copied.' });
    } else {
      alertModal.open(`Your browser didn’t allow copying. The join codes:\n\n${result.text}`);
    }
  };

  if (snap.error) {
    return (
      <div role='alert' className='alert alert-error max-w-xl'>
        {snap.error}
      </div>
    );
  }

  if (!snap.overview) {
    return <span className='loading loading-spinner' aria-label='Loading' />;
  }

  const { counts, runStatus, teamsConnected } = snap.overview;
  const items = checklist(event.id, counts);
  const missing = items.filter((item) => item.state === 'missing' || item.state === 'warning').length;

  return (
    <>
      <div className='flex flex-wrap items-center gap-3 mb-6'>
        <h1 className='text-3xl font-bold'>{event.name}</h1>
        <RunBadge runStatus={runStatus} teamsConnected={teamsConnected} />
      </div>

      <div className='flex flex-wrap gap-2 mb-8'>
        <a className='btn btn-primary' href={eventUrl(event.id, 'run')}>
          <Icon name='play-circle' className='size-5' />
          Run
        </a>
        <button className='btn' onClick={() => openPresenter(event.id)}>
          <Icon name='presentation-chart-bar' className='size-5' />
          Present
        </button>
        <a className='btn' href={eventUrl(event.id, 'grade')}>
          <Icon name='scale' className='size-5' />
          Grade
        </a>
        <button className='btn' onClick={handleCopyJoinCodes} disabled={counts.teams === 0}>
          <Icon name='document-duplicate' className='size-5' />
          Copy join codes
        </button>
      </div>

      <section aria-labelledby='EventHome__setup' className='card bg-base-100 shadow-sm max-w-2xl'>
        <div className='card-body'>
          <h2 id='EventHome__setup' className='card-title'>
            {missing === 0 ? 'Ready to run' : `${plural(missing, 'thing')} to finish before running`}
          </h2>
          <ul className='divide-y divide-base-200'>
            {items.map((item) => (
              <li key={item.label} className='flex items-center gap-3 py-3'>
                {STATE_ICON[item.state]}
                <span className='font-medium w-28 flex-none'>{item.label}</span>
                <span className='flex-1 text-base-content/70'>{item.detail}</span>
                {item.action && (
                  <a className='btn btn-sm btn-ghost text-primary' href={item.action.href}>
                    {item.action.label} →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
});

ManagerHome.displayName = 'ManagerHome';

// A judge's home: they can only grade.
const JudgeHome = ({ event }: { event: CurrentEvent }) => (
  <>
    <h1 className='text-3xl font-bold mb-6'>{event.name}</h1>
    <p className='mb-4 text-base-content/70'>You’re a judge for this event.</p>
    <a className='btn btn-primary' href={eventUrl(event.id, 'grade')}>
      <Icon name='scale' className='size-5' />
      Grade
    </a>
  </>
);

// The event's home page at /events/:id (#69): what's ready, what's missing, quick actions.
const EventHomeContent = memo(() => {
  const appValt = useAppValt();
  const event = useSnapshot(appValt.store).currentEvent;

  if (!event) {
    return null;
  }

  return (
    <div className='bg-base-100/95 flex-1 overflow-auto p-8'>
      {MANAGERS.includes(event.roleId) ? <ManagerHome event={event} /> : <JudgeHome event={event} />}
    </div>
  );
});

EventHomeContent.displayName = 'EventHomeContent';

export const EventHome = () => <EventLayout section={null} Page={EventHomeContent} />;

EventHome.displayName = 'EventHome';
