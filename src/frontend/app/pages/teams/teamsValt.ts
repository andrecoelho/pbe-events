import { copyText } from '@/frontend/utils/clipboard';
import { joinLink } from '@/joinCode';
import { proxy } from 'valtio';

export interface Language {
  id: string;
  code: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  number: number;
  languageId: string | null;
  languageName: string;
  // The code the team joins with (#44).
  joinCode: string;
}

export interface TeamsStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  copiedTeamIds: Set<string>;
  languages: Language[];
  teams: Team[];
}

export class TeamsValt {
  store: TeamsStore;
  private copyTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.store = proxy({
      initialized: false,
      eventId: '',
      eventName: '',
      languages: [],
      teams: [],
      copiedTeamIds: new Set()
    });
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/teams`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load teams' } as const;
    }

    const response = (await result.json()) as {
      eventName: string;
      teams: TeamsStore['teams'];
      languages: TeamsStore['languages'];
    };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.languages = response.languages;
    this.store.teams = response.teams;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async addTeam(name: string, languageId: string) {
    const result = await fetch(`/api/events/${this.store.eventId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, languageId })
    });

    if (result.status === 200) {
      const response = (await result.json()) as {
        id: string;
        number: number;
        joinCode: string;
        languageId: string;
        languageName: string;
      };
      this.store.teams.push({
        id: response.id,
        name,
        number: response.number,
        languageId: response.languageId,
        languageName: response.languageName,
        joinCode: response.joinCode
      });
      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  async updateTeam(id: string, name: string, number: number, languageId: string) {
    const team = this.store.teams.find((t) => t.id === id);

    if (!team) {
      return { ok: false, error: 'Team not found' };
    }

    const result = await fetch(`/api/events/${this.store.eventId}/teams`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, number, languageId })
    });

    if (result.status === 200) {
      team.name = name;
      team.number = number;
      team.languageId = languageId;

      // Update language name from store
      const language = this.store.languages.find((l) => l.id === languageId);

      if (language) {
        team.languageName = language.name;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  async deleteTeam(id: string) {
    const teamToDelete = this.store.teams.find((t) => t.id === id);

    if (!teamToDelete) {
      return { ok: false, error: 'Team not found' };
    }

    const result = await fetch(`/api/events/${this.store.eventId}/teams`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    if (result.status === 200) {
      // Remove the deleted team
      this.store.teams = this.store.teams.filter((t) => t.id !== id);

      // Renumber teams with higher numbers to close the gap
      this.store.teams.forEach((team) => {
        if (team.number > teamToDelete.number) {
          team.number -= 1;
        }
      });

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  // Copies the link the team joins with (/join/K7P4QX); the copy button shows a checkmark for 2 seconds.
  // When the browser refuses, returns the link so the page can show it.
  async copyTeamLink(teamId: string): Promise<{ ok: true } | { ok: false; link: string }> {
    const team = this.store.teams.find((t) => t.id === teamId);

    if (!team) {
      return { ok: true };
    }

    const link = joinLink(window.location.origin, team.joinCode);

    if (!(await copyText(link))) {
      return { ok: false, link };
    }

    // Restart the 2-second checkmark if the link was copied again.
    clearTimeout(this.copyTimeouts.get(teamId));

    this.copyTimeouts.set(
      teamId,
      setTimeout(() => {
        this.copyTimeouts.delete(teamId);
        this.store.copiedTeamIds = new Set([...this.store.copiedTeamIds].filter((id) => id !== teamId));
      }, 2000)
    );

    // A new Set, so the snapshot sees the change.
    this.store.copiedTeamIds = new Set(this.store.copiedTeamIds).add(teamId);

    return { ok: true };
  }

  cleanup() {
    // Clear all pending timeouts
    this.copyTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.copyTimeouts.clear();
  }
}
