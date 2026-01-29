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
};

export class ResultsValt {
  store: ResultsStore;

  constructor() {
    this.store = proxy<ResultsStore>({
      initialized: false,
      eventId: '',
      eventName: '',
      maxPoints: 0,
      highestPoints: 0,
      teams: []
    });
  }

  async init(eventId: string) {
    this.store.initialized = false;

    const result = await fetch(`/api/events/${eventId}/results`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load results' } as const;
    }

    const response = await result.json();

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.maxPoints = response.maxPoints;
    this.store.highestPoints = response.teams.reduce((highestPoints: number, team: any) => Math.max(highestPoints, team.totalPoints), 0);

    this.store.teams = response.teams.map((team: any) => ({
      ...team,
      absPercentage: response.maxPoints > 0 ? (team.totalPoints / response.maxPoints) * 100 : 0,
      percentage: response.maxPoints > 0 ? (team.totalPoints / this.store.highestPoints) * 100 : 0
    }));

    this.store.initialized = true;

    return { ok: true } as const;
  }

  downloadResultsCSV() {
    const rows = [
      ['Team Number', 'Team Name', 'Language', 'Total Points', 'Max Points', 'ABS Percentage', 'Highest Points', 'Percentage'],
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
    const result = await fetch(`/api/events/${this.store.eventId}/results/raw`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load raw answers' } as const;
    }

    const response = await result.json();

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
