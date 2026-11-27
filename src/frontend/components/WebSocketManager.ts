import { setServerClock, type ClockSample } from '@/frontend/utils/serverClock';
import { SESSION_ENDED_CLOSE_CODE, TEAM_REPLACED_CLOSE_CODE, type AckMessage, type ServerMessage } from '@/types';

// Reconnecting never gives up (#49): 1 s, 2 s, 4 s … up to 30 s between attempts, each randomly shortened by up
// to half so a room of devices doesn't reconnect all at once after a deploy.
const MAX_RECONNECT_DELAY_MS = 30_000;
const ACK_TIMEOUT_MS = 2000;
const SERVER_TIMEOUT_MS = 10000;

// Every page message is one of the shared client message types (src/types.ts, #55); this is their common shape.
type OutgoingMessage = { type: string };

// What sendMessage resolves with: the server's answer once it handled the message (#53), or why it never
// arrived. `error` is a sentence to show the person.
export type MessageResult = { ok: true } | { ok: false; error: string };

// The server's answer to a message: its result, plus the server's clock when it answered (#47).
type Ack = { result: MessageResult; serverTime?: number };

const CLOCK_SAMPLES = 5;
const CLOCK_SYNC_MS = 60_000;

export const NOT_CONNECTED: MessageResult = {
  ok: false,
  error: 'Not connected to the event. Check your connection and try again.'
};
// 'replaced': another tab or window of this device took over the team (#30); nothing reconnects until connect().
export type WebSocketStatus = 'init' | 'connected' | 'connecting' | 'offline' | 'error' | 'replaced';

// A message waiting to be sent, kept across reconnects (#50); see sendMessage's `queueKey`.
type Queued = { message: OutgoingMessage; resolvers: ((result: MessageResult) => void)[]; sending: boolean };

// TSend: the messages this page's role may send (TeamClientMessage, HostClientMessage, …). Every page receives
// the shared ServerMessage.
export class WebSocketManager<TSend extends OutgoingMessage> {
  private ws: WebSocket | null = null;

  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private offlineTimer: number | null = null;
  private pendingACKs: Map<string, { resolve: (ack: Ack) => void; timerId: number }> = new Map();
  private clockSyncTimer: number | null = null;
  private outbox = new Map<string, Queued>();
  private wsURL: string;
  private onStatusChange?: (status: WebSocketStatus) => void;
  private onMessage?: (message: ServerMessage) => void;

  constructor(
    wsURL: string,
    onStatusChange?: (status: WebSocketStatus) => void,
    onMessage?: (message: ServerMessage) => void
  ) {
    this.wsURL = wsURL;
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;

    if (document.visibilityState === 'visible') {
      void this.requestWakeLock();
    }

    this.addEventListeners();
  }

  private addEventListeners = () => {
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  };

  private removeEventListeners = () => {
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  };

  private reconnect = () => {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS) * (0.5 + Math.random() / 2);

    this.reconnectAttempts++;
    this.changeStatus('connecting');
    this.reconnectTimer = window.setTimeout(this.connect, delay);
  };

  private handleWSOpen = () => {
    this.reconnectAttempts = 0;

    this.changeStatus('connected');

    this.flushOutbox();
    void this.syncClock();
    this.clearClockSyncTimer();
    this.clockSyncTimer = window.setInterval(this.syncClock, CLOCK_SYNC_MS);
  };

  // Measures this page's offset from the server clock with a few pings, one at a time (see serverClock.ts).
  private syncClock = async () => {
    const samples: ClockSample[] = [];

    for (let i = 0; i < CLOCK_SAMPLES; i++) {
      const sent = Date.now();
      const { result, serverTime } = await this.request({ type: 'PING' });
      const received = Date.now();

      if (!result.ok || serverTime === undefined) {
        break;
      }

      samples.push({ sent, received, serverTime });
    }

    setServerClock(samples);
  };

  private clearClockSyncTimer = () => {
    if (this.clockSyncTimer) {
      clearInterval(this.clockSyncTimer);
      this.clockSyncTimer = null;
    }
  };

  private handleWSClose = (event: CloseEvent) => {
    const wasConnected = !!this.ws;

    this.reset();

    // Signed out or the session expired: reloading shows the login page.
    if (event.code === SESSION_ENDED_CLOSE_CODE) {
      this.removeEventListeners();
      window.location.reload();
      return;
    }

    if (event.code === TEAM_REPLACED_CLOSE_CODE) {
      this.changeStatus('replaced');
      return;
    }

    if (window.navigator.onLine) {
      if (wasConnected) {
        this.reconnect();
      } else {
        this.connect();
      }
    }
  };

  private handleWSMessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as ServerMessage | AckMessage;

    if (message.type === 'ACK') {
      const pending = this.pendingACKs.get(message.id);

      if (pending) {
        clearTimeout(pending.timerId);
        pending.resolve({
          result: message.ok ? { ok: true } : { ok: false, error: message.error },
          serverTime: message.serverTime
        });
        this.pendingACKs.delete(message.id);
      }

      return;
    }

    this.onMessage?.(message);
  };

  private handleOffline = () => {
    this.changeStatus('offline');
    this.offlineTimer = window.setTimeout(this.reset, SERVER_TIMEOUT_MS);
  };

  private handleOnline = async () => {
    this.clearOfflineTimer();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      await this.syncClock();
      this.changeStatus('connected');
    } else {
      this.connect();
    }
  };

  private handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      await this.requestWakeLock();
      // Timers may have drifted while the tab was hidden (and the computer asleep).
      await this.syncClock();
    }
  };

  // Keeps the screen on during the event where the browser allows it. Browsers refuse it at times (a hidden
  // tab, no permission, battery saver); the page works the same without it, so a refusal is ignored.
  private requestWakeLock = async () => {
    try {
      await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }).wakeLock?.request(
        'screen'
      );
    } catch {
      // Not allowed right now; the screen may dim as usual.
    }
  };

  private clearReconnectTimer = () => {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  private clearOfflineTimer = () => {
    if (this.offlineTimer) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }
  };

  private changeStatus = (status: WebSocketStatus) => {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  };

  // ---------------------------------------------------------------------------
  // Public Methods
  connect = () => {
    if (!window.navigator.onLine) {
      return;
    }

    this.changeStatus('connecting');

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.ws = new WebSocket(this.wsURL);

      this.ws.addEventListener('open', this.handleWSOpen);
      this.ws.addEventListener('message', this.handleWSMessage);
      this.ws.addEventListener('close', this.handleWSClose);
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.changeStatus('connected');
    }
  };

  reset = () => {
    this.clearReconnectTimer();
    this.clearOfflineTimer();
    this.clearClockSyncTimer();

    this.pendingACKs.forEach((pending) => {
      clearTimeout(pending.timerId);
      pending.resolve({ result: NOT_CONNECTED });
    });

    this.pendingACKs.clear();

    if (this.ws) {
      this.ws.removeEventListener('close', this.handleWSClose);
      this.ws.close();
      this.ws = null;
    }
  };

  destroy = () => {
    this.reset();
    this.removeEventListeners();
  };

  // Sends a message and resolves with the server's answer. With a `queueKey` (e.g. a team's answer), a message
  // that can't be sent now waits and is resent after reconnecting until the server answers (#50); a newer
  // message with the same key replaces it, and every caller gets the newest one's result.
  sendMessage = async (message: TSend, options?: { queueKey?: string }): Promise<MessageResult> => {
    const key = options?.queueKey;

    if (!key) {
      return (await this.request(message)).result;
    }

    const { promise, resolve } = Promise.withResolvers<MessageResult>();
    const queued = this.outbox.get(key);

    if (queued) {
      queued.message = message;
      queued.resolvers.push(resolve);
    } else {
      this.outbox.set(key, { message, resolvers: [resolve], sending: false });
    }

    this.flushOutbox();

    return promise;
  };

  // Whether messages are waiting to be sent (for "your answer will be sent" notices).
  hasQueuedMessages = () => this.outbox.size > 0;

  private flushOutbox = () => {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const [key, queued] of this.outbox) {
      if (queued.sending) {
        continue;
      }

      const sent = queued.message;
      queued.sending = true;

      void this.request({ ...sent }).then(({ result }) => {
        queued.sending = false;

        // Lost on the way (the connection dropped): it stays queued for the next connection.
        if (result === NOT_CONNECTED) {
          return;
        }

        // Replaced while it was on its way: send the newer one.
        if (queued.message !== sent) {
          this.flushOutbox();
          return;
        }

        this.outbox.delete(key);
        queued.resolvers.forEach((resolveResult) => resolveResult(result));
      });
    }
  };

  private request = (message: OutgoingMessage) => {
    const { promise, resolve } = Promise.withResolvers<Ack>();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const ackId = crypto.randomUUID();
      const frame = { ...message, __ACK__: ackId };

      this.pendingACKs.set(ackId, {
        resolve,
        timerId: window.setTimeout(() => {
          console.warn('ACK not received for message:', message);
          this.reset();
          this.connect();
        }, ACK_TIMEOUT_MS)
      });

      this.ws.send(JSON.stringify(frame));
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message);
      resolve({ result: NOT_CONNECTED });
    }

    return promise;
  };
}
