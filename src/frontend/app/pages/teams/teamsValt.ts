import { proxy } from 'valtio';

interface TeamsStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  copiedTeamIds: Set<string>;
  teams: {
    id: string;
    name: string;
    number: number;
  }[];
}

export class TeamsValt {
  store: TeamsStore;
  private copyTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.store = proxy({ initialized: false, eventId: '', eventName: '', teams: [], copiedTeamIds: new Set() });
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/teams`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load teams' } as const;
    }

    const response = (await result.json()) as { eventName: string; teams: TeamsStore['teams'] };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.teams = response.teams;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async addTeam(name: string) {
    const result = await fetch(`/api/events/${this.store.eventId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (result.status === 200) {
      const response = (await result.json()) as { id: string; number: number };
      this.store.teams.push({ id: response.id, name, number: response.number });
      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  async updateTeam(id: string, name: string, number: number) {
    const team = this.store.teams.find((t) => t.id === id);

    if (!team) {
      return { ok: false, error: 'Team not found' };
    }

    const result = await fetch(`/api/events/${this.store.eventId}/teams`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, number })
    });

    if (result.status === 200) {
      team.name = name;
      team.number = number;

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

  async copyTeamLink(teamId: string) {
    const teamEventUrl = new URL('/event-run/team', window.location.origin);

    teamEventUrl.search = new URLSearchParams({ eventId: this.store.eventId, teamId }).toString();

    try {
      await navigator.clipboard.writeText(teamEventUrl.toString());

      // Clear any existing timeout for this team
      const existingTimeout = this.copyTimeouts.get(teamId);

      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Add team to copied set
      this.store.copiedTeamIds.add(teamId);

      // Reset the icon after 2 seconds
      const timeout = setTimeout(() => {
        this.store.copiedTeamIds.delete(teamId);
        this.copyTimeouts.delete(teamId);

        this.store.copiedTeamIds = new Set(this.store.copiedTeamIds);
      }, 2000);

      this.store.copiedTeamIds.add(teamId);
      this.copyTimeouts.set(teamId, timeout);

      this.store.copiedTeamIds = new Set(this.store.copiedTeamIds);
    } catch (error) {
      console.error('Failed to copy link to clipboard:', error);
    }
  }

  cleanup() {
    // Clear all pending timeouts
    this.copyTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.copyTimeouts.clear();
  }
}
