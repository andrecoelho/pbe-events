import { toast } from '@/frontend/components/Toast';
import { WebSocketManager } from '@/frontend/components/WebSocketManager';
import { api, type Outcome } from '@/frontend/utils/api';
import { debounce } from '@/frontend/utils/debounce';
import type { ResultsClientMessage, ServerMessage } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

export type TeamResult = {
  id: string;
  number: number;
  name: string;
  languageId: string;
  languageName: string;
  totalPoints: number;
  percentage: number;
  absPercentage: number;
};

export type ResultsStore = {
  initialized: boolean;
  eventId: string;
  eventName: string;
  maxPoints: number;
  highestPoints: number;
  teams: TeamResult[];
  excludedTeamIds: Set<string>;
  // Connected for live updates.
  live: boolean;
};

export class ResultsValt {
  store: ResultsStore;
  private ws: WebSocketManager<ResultsClientMessage> | null = null;

  constructor() {
    this.store = proxy<ResultsStore>({
      initialized: false,
      eventId: '',
      eventName: '',
      maxPoints: 0,
      highestPoints: 0,
      teams: [],
      excludedTeamIds: new Set(),
      live: false
    });
  }

  async init(eventId: string) {
    this.store.initialized = false;
    this.store.eventId = eventId;

    const loaded = await this.load();

    if (!loaded.ok) {
      return loaded;
    }

    this.store.initialized = true;
    this.connect();

    return { ok: true } as const;
  }

  // Loads the totals; a reload keeps the excluded teams and doesn't show the loading state.
  private async load(): Promise<Outcome> {
    const result = await api<{
      eventName: string;
      maxPoints: number | string;
      teams: (Omit<TeamResult, 'totalPoints' | 'percentage' | 'absPercentage'> & { totalPoints: number | string })[];
    }>(`/api/events/${this.store.eventId}/results`);

    if (!result.ok) {
      return { ok: false, error: `Couldn’t load the results. ${result.error}` };
    }

    const response = result.data;

    this.store.eventName = response.eventName;
    this.store.maxPoints = Number(response.maxPoints);
    this.store.teams = response.teams.map((team) => ({
      ...team,
      totalPoints: Number(team.totalPoints),
      absPercentage: this.store.maxPoints > 0 ? (Number(team.totalPoints) / this.store.maxPoints) * 100 : 0,
      percentage: 0
    }));
    this.applyHighest();

    return { ok: true };
  }

  // Live updates (#27): the server says when totals may have changed (points given, a new answer, a run
  // started over); a burst of those reloads once.
  private connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({ role: 'results', eventId: this.store.eventId }).toString();

    this.ws = new WebSocketManager<ResultsClientMessage>(
      wsUrl.toString(),
      (status) => {
        this.store.live = status === 'connected';
      },
      (message: ServerMessage) => {
        if (message.type === 'RESULTS_CHANGED') {
          this.reloadSoon();
        }
      }
    );

    this.ws.connect();
  }

  private reloadSoon = debounce(async () => {
    const loaded = await this.load();

    if (!loaded.ok) {
      toast.show({ type: 'error', message: loaded.error });
    }
  }, 500);

  cleanup = () => {
    this.ws?.destroy();
    this.ws = null;
  };

  excludeTeam(teamId: string) {
    if (this.store.excludedTeamIds.has(teamId)) {
      this.store.excludedTeamIds.delete(teamId);
    } else {
      this.store.excludedTeamIds.add(teamId);
    }

    this.store.excludedTeamIds = new Set(this.store.excludedTeamIds);
    this.applyHighest();
  }

  // The highest total among the included teams, and each team's percentage of it.
  private applyHighest() {
    this.store.highestPoints = this.store.teams.reduce(
      (highest, team) => (this.store.excludedTeamIds.has(team.id) ? highest : Math.max(highest, team.totalPoints)),
      0
    );

    this.store.teams = this.store.teams.map((team) => ({
      ...team,
      percentage: this.store.highestPoints > 0 ? (team.totalPoints / this.store.highestPoints) * 100 : 0
    }));
  }

  downloadResultsCSV() {
    const rows = [
      [
        'Team Number',
        'Team Name',
        'Language',
        'Total Points',
        'Max Points',
        'ABS Percentage',
        'Highest Points',
        'Percentage'
      ],
      ...this.store.teams.map((team) => [
        team.number.toString(),
        team.name,
        team.languageName,
        team.totalPoints.toString(),
        this.store.maxPoints.toString(),
        team.absPercentage.toString(),
        this.store.highestPoints.toString(),
        `${team.percentage.toFixed(2)}%`
      ])
    ];

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `${this.store.eventName.replace(/[^a-z0-9]/gi, '_')}_results.csv`;

    a.click();
    URL.revokeObjectURL(url);
  }

  async downloadRawAnswersCSV() {
    const result = await api<any>(`/api/events/${this.store.eventId}/results/raw`);

    if (!result.ok) {
      return { ok: false, error: `Couldn’t download the answers. ${result.error}` } as const;
    }

    const response = result.data;

    const rows = [
      ['Question Number', 'Team Number', 'Team Name', 'Language', 'Answer', 'Points', 'Highest Points', 'Max Points'],
      ...response.answers.map((answer: any) => [
        answer.questionNumber.toString(),
        answer.teamNumber.toString(),
        answer.teamName,
        answer.languageName,
        answer.answer,
        answer.points.toString(),
        this.store.highestPoints.toString(),
        this.store.maxPoints.toString()
      ])
    ];

    const csv = rows.map((row) => row.map((cell: any) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `${this.store.eventName.replace(/[^a-z0-9]/gi, '_')}_raw_answers.csv`;

    a.click();
    URL.revokeObjectURL(url);

    return { ok: true } as const;
  }
}

export const ResultsValtContext = createContext<ResultsValt>(new ResultsValt());
export const useResultsValt = () => useContext(ResultsValtContext);
