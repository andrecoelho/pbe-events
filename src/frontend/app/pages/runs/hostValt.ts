import { createContext, useContext } from 'react';
import { proxy, ref } from 'valtio';
import { toast } from '@/frontend/components/Toast';

export interface TeamStatus {
  teamId: string;
  name: string;
  number: number;
  status: 'offline' | 'connected' | 'ready';
  languageCode: string | null;
  hasAnswer: boolean;
}

export interface Question {
  questionId: string;
  number: number;
  type: string;
  maxPoints: number;
  seconds: number;
}

export interface Slide {
  slideId: string;
  number: number;
  content: string;
}

interface HostStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  run: {
    eventId: string;
    status: 'not_started' | 'in_progress' | 'paused' | 'completed';
    gracePeriod: number;
    activeQuestion?: {
      id: string;
      number: number;
      type: string;
      maxPoints: number;
      seconds: number;
    };
    activeSlide?: {
      id: string;
      number: number;
      content: string;
    };
  } | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'closed' | 'error';
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  questions: Question[];
  slides: Slide[];
  languages: Map<string, string>;
  teams: Map<string, TeamStatus>;
}

export class HostValt {
  store: HostStore;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private ws: WebSocket | null = null;

  constructor() {
    this.store = proxy({
      initialized: false,
      eventId: '',
      eventName: '',
      run: null,
      connectionState: 'disconnected',
      reconnectAttempts: 0,
      maxReconnectAttempts: 3,
      questions: [],
      slides: [],
      languages: new Map(),
      teams: new Map()
    });
  }

  async init(eventId: string) {
    // Get event name
    const eventResult = await fetch(`/api/events`);

    if (eventResult.status !== 200) {
      return { ok: false, error: 'Failed to load event' } as const;
    }

    const eventsResponse = (await eventResult.json()) as {
      events: Array<{ id: string; name: string; role_id: string }>;
    };

    const event = eventsResponse.events.find((e) => e.id === eventId);

    if (!event) {
      return { ok: false, error: 'Event not found' } as const;
    }

    // Get run
    const runResult = await fetch(`/api/events/${eventId}/run`);

    if (runResult.status !== 200) {
      return { ok: false, error: 'Failed to load run' } as const;
    }

    const runResponse = (await runResult.json()) as {
      run: {
        eventId: string;
        status: 'not_started' | 'in_progress' | 'paused' | 'completed';
        gracePeriod: number;
        activeQuestion?: {
          id: string;
          number: number;
          type: string;
          maxPoints: number;
          seconds: number;
        };
        activeSlide?: {
          id: string;
          number: number;
          content: string;
        };
      };
    };

    this.store.eventId = eventId;
    this.store.eventName = event.name;
    this.store.run = runResponse.run;

    // Fetch questions, slides, and teams
    await this.fetchQuestionsAndSlides();
    await this.fetchTeams();

    this.store.initialized = true;

    // Auto-connect WebSocket if run is in progress or paused
    if (this.store.run?.status === 'in_progress' || this.store.run?.status === 'paused') {
      this.connectWebSocket();
    }

    return { ok: true } as const;
  }

  async fetchQuestionsAndSlides() {
    try {
      // Fetch questions
      const questionsResult = await fetch(`/api/events/${this.store.eventId}/questions`);

      if (questionsResult.status === 200) {
        const data = (await questionsResult.json()) as {
          questions: Record<
            string,
            {
              id: string;
              number: number;
              type: string;
              maxPoints: number;
              seconds: number;
            }
          >;
          languages: Record<string, string>;
        };

        this.store.questions = Object.values(data.questions)
          .map((q) => ({
            questionId: q.id,
            number: q.number,
            type: q.type,
            maxPoints: q.maxPoints,
            seconds: q.seconds
          }))
          .sort((a, b) => a.number - b.number);
        this.store.languages = new Map(Object.entries(data.languages));
      }

      // Fetch slides
      const slidesResult = await fetch(`/api/events/${this.store.eventId}/slides`);

      if (slidesResult.status === 200) {
        const data = (await slidesResult.json()) as {
          slides: Array<{ id: string; number: number; content: string }>;
        };

        this.store.slides = data.slides
          .map((s) => ({
            slideId: s.id,
            number: s.number,
            content: s.content
          }))
          .sort((a, b) => a.number - b.number);
      }
    } catch (error) {
      console.error('Error fetching questions and slides:', error);
    }
  }

  async fetchTeams() {
    try {
      const result = await fetch(`/api/events/${this.store.eventId}/teams`);

      if (result.status === 200) {
        const data = (await result.json()) as {
          teams: Array<{ id: string; name: string; number: number }>;
        };

        // Initialize teams as offline
        data.teams.forEach((team) => {
          this.store.teams.set(team.id, {
            teamId: team.id,
            name: team.name,
            number: team.number,
            status: 'offline',
            languageCode: null,
            hasAnswer: false
          });
        });
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  }

  connectWebSocket() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.store.connectionState = 'connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/event-run/ws?role=host&eventId=${this.store.eventId}&teamId=host`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.ws = ws;
        this.store.connectionState = 'connected';
        this.store.reconnectAttempts = 0;
      };

      ws.onclose = () => {
        this.ws = null;
        this.store.connectionState = 'closed';
      };

      ws.onerror = () => {
        // Attempt reconnection with exponential backoff
        if (this.store.reconnectAttempts < this.store.maxReconnectAttempts) {
          const delay = Math.pow(2, this.store.reconnectAttempts) * 1000;

          this.store.reconnectAttempts++;

          this.reconnectTimeout = setTimeout(() => {
            this.connectWebSocket();
          }, delay);
        } else {
          this.store.connectionState = 'error';

          toast.show({
            message: 'Connection lost. Click Reconnect to try again.',
            type: 'error',
            persist: true
          });
        }

        this.store.connectionState = 'error';
      };

      ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };
    } catch (error) {
      this.store.connectionState = 'error';
      toast.show({ message: 'Failed to connect', type: 'error' });
    }
  }

  disconnectWebSocket() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.store.connectionState = 'disconnected';
  }

  manualReconnect() {
    this.store.reconnectAttempts = 0;
    this.store.connectionState = 'connecting';
    this.connectWebSocket();
  }

  getConnectionState() {
    return this.store.connectionState;
  }

  sendMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleWebSocketMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'TEAM_STATUS':
          // Initial team status on connection
          message.teams.forEach((team: any) => {
            const existingTeam = this.store.teams.get(team.teamId);

            if (existingTeam) {
              existingTeam.status =
                team.status === 'TEAM_OFFLINE' ? 'offline' : team.status === 'TEAM_CONNECTED' ? 'connected' : 'ready';

              existingTeam.languageCode = team.languageCode;
            }
          });
          break;

        case 'TEAM_CONNECTED':
          {
            const team = this.store.teams.get(message.teamId);

            if (team) {
              team.status = 'connected';
              team.languageCode = message.languageCode;
            }
          }
          break;

        case 'TEAM_READY':
          {
            const team = this.store.teams.get(message.teamId);

            if (team) {
              team.status = 'ready';
              team.languageCode = message.languageCode;
            }
          }
          break;

        case 'TEAM_DISCONNECTED':
          {
            const team = this.store.teams.get(message.teamId);

            if (team) {
              team.status = 'offline';
              team.hasAnswer = false;
            }
          }
          break;

        case 'ANSWER_RECEIVED':
          {
            const team = this.store.teams.get(message.teamId);

            if (team) {
              team.hasAnswer = message.hasAnswer;
            }
          }
          break;

        case 'GRACE_PERIOD_UPDATED':
          if (this.store.run) {
            this.store.run.gracePeriod = message.gracePeriod;
          }
          break;

        case 'RUN_PAUSED':
          if (this.store.run) {
            this.store.run.status = 'paused';
          }

          break;

        case 'RUN_RESUMED':
          if (this.store.run) {
            this.store.run.status = 'in_progress';
          }

          break;

        case 'ANSWER_SHOWN':
          break;

        case 'QUESTION_ENDED':
          break;

        case 'ERROR':
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  async startRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.status = 'in_progress';
      }

      // Connect WebSocket after starting
      this.connectWebSocket();

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async pauseRun() {
    this.sendMessage({ type: 'PAUSE_RUN' });
    return { ok: true };
  }

  async resumeRun() {
    this.sendMessage({ type: 'RESUME_RUN' });
    return { ok: true };
  }

  async startQuestion(questionId: string, hasTimer: boolean) {
    this.sendMessage({ type: 'START_QUESTION', questionId, hasTimer });
    return { ok: true };
  }

  async showAnswer() {
    this.sendMessage({ type: 'SHOW_ANSWER' });
    return { ok: true };
  }

  async endQuestion() {
    this.sendMessage({ type: 'END_QUESTION' });
    return { ok: true };
  }

  async showSlide(slideId: string) {
    this.sendMessage({ type: 'SHOW_SLIDE', slideId });
    return { ok: true };
  }

  async navigateNext() {
    const result = await fetch(`/api/events/${this.store.eventId}/run/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'next' })
    });

    if (result.status === 200) {
      const data = (await result.json()) as { run: any };

      if (this.store.run) {
        this.store.run = data.run;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async navigatePrevious() {
    const result = await fetch(`/api/events/${this.store.eventId}/run/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'previous' })
    });

    if (result.status === 200) {
      const data = (await result.json()) as { run: any };

      if (this.store.run) {
        this.store.run = data.run;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async navigateToSlide(slideNumber: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/run/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slideNumber })
    });

    if (result.status === 200) {
      const data = (await result.json()) as { run: any };

      if (this.store.run) {
        this.store.run = data.run;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async navigateToQuestion(questionId: string, phase: 'prompt' | 'answer' | 'ended') {
    const result = await fetch(`/api/events/${this.store.eventId}/run/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, phase })
    });

    if (result.status === 200) {
      const data = (await result.json()) as { run: any };

      if (this.store.run) {
        this.store.run = data.run;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async completeRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.status = 'completed';
      }

      this.disconnectWebSocket();

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async updateGracePeriod(gracePeriod: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateGracePeriod', gracePeriod })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.gracePeriod = gracePeriod;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async resetRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.status = 'not_started';
        this.store.run.activeQuestion = undefined;
        this.store.run.activeSlide = undefined;
      }

      // Reset team answer status
      this.store.teams.forEach((team) => {
        team.hasAnswer = false;
      });

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }
}

export const HostValtContext = createContext<HostValt | null>(null);
export const useHostValt = () => {
  const context = useContext(HostValtContext);
  if (!context) throw new Error('useHostValt must be used within HostValtContext.Provider');
  return context;
};
