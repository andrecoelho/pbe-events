interface TeamStore {
  eventId: string;
  teamId: string;
}

export class TeamValt {
  store: TeamStore;
  private ws: WebSocket | null = null;

  constructor(eventId: string, teamId: string) {
    this.store = { eventId, teamId };
  }

  async init() {
    await this.connectWebSocket();
  }

  async connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({
      role: 'team',
      eventId: this.store.eventId,
      teamId: this.store.teamId
    }).toString();

    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onerror = (event) => {};
    this.ws.onopen = () => {};

    this.ws.onclose = () => {
      this.ws = null;
    };
  }
}
