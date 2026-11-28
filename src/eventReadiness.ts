// What an event still needs before it can run, shared by the event list's hint (#71) and the event home page's
// checklist (#69), so both say the same thing. Intro slides and judges are optional, so they never count.
import type { EventCounts, RunStatus } from '@/types';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed'
};

export function setupProblems(counts: EventCounts): string[] {
  const problems: string[] = [];

  if (counts.languages === 0) {
    problems.push('no languages');
  }

  if (counts.questions === 0) {
    problems.push('no questions');
  } else if (counts.questionsMissingTranslations > 0) {
    problems.push(
      counts.questionsMissingTranslations === 1
        ? '1 question missing a translation'
        : `${counts.questionsMissingTranslations} questions missing a translation`
    );
  }

  if (counts.teams === 0) {
    problems.push('no teams');
  }

  return problems;
}
