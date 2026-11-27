import { SESSION_ENDED_CLOSE_CODE } from '@/types';

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECONNECT_DELAY_MS = 10000;
const ACK_TIMEOUT_MS = 2000;
const SERVER_TIMEOUT_MS = 10000;

export type WebSocketMessage = { type: string } & Record<string, any>;

// What sendMessage resolves with: the server's answer once it handled the message (#53), or why it never
// arrived. `error` is a sentence to show the person.
export type MessageResult = { ok: true } | { ok: false; error: string };

export const NOT_CONNECTED: MessageResult = {
  ok: false,
  error: 'Not connected to the event. Check your connection and try again.'
};
export type WebSocketStatus = 'init' | 'connected' | 'connecting' | 'offline' | 'error';

export class WebSocketManager<TMessage extends WebSocketMessage = WebSocketMessage> {
  private ws: WebSocket | null = null;

  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private offlineTimer: number | null = null;
  private pendingACKs: Map<string, { resolve: (value: MessageResult) => void; timerId: number }> = new Map();
  private wsURL: string;
  private onStatusChange?: (status: WebSocketStatus) => void;
  private onMessage?: (message: TMessage) => void;

  constructor(
    wsURL: string,
    onStatusChange?: (status: WebSocketStatus) => void,
    onMessage?: (message: TMessage) => void
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
    this.reconnectAttempts++;
    this.changeStatus('connecting');

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);

      this.reconnectTimer = window.setTimeout(this.connect, delay);
    } else {
      this.reconnectAttempts = 0;

      this.changeStatus('error');
      this.reset();
    }
  };

  private handleWSOpen = () => {
    this.reconnectAttempts = 0;

    this.changeStatus('connected');
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

    if (window.navigator.onLine) {
      if (wasConnected) {
        this.reconnect();
      } else {
        this.connect();
      }
    }
  };

  private handleWSMessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as TMessage;

    if (message.type === 'ACK') {
      const pending = this.pendingACKs.get(message.id);

      if (pending) {
        clearTimeout(pending.timerId);
        pending.resolve(message.ok === false ? { ok: false, error: String(message.error) } : { ok: true });
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
      await this.sendPing();
      this.changeStatus('connected');
    } else {
      this.connect();
    }
  };

  private handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      await this.requestWakeLock();
      await this.sendPing();
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

  private sendPing = async () => await this.sendMessage({ type: 'PING' });

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

    this.pendingACKs.forEach((pending) => {
      clearTimeout(pending.timerId);
      pending.resolve(NOT_CONNECTED);
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

  sendMessage = (message: WebSocketMessage) => {
    const { promise, resolve } = Promise.withResolvers<MessageResult>();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const ackId = crypto.randomUUID();
      message['__ACK__'] = ackId;

      this.pendingACKs.set(ackId, {
        resolve,
        timerId: window.setTimeout(() => {
          console.warn('ACK not received for message:', message);
          this.reset();
          this.connect();
        }, ACK_TIMEOUT_MS)
      });

      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message);
      resolve(NOT_CONNECTED);
    }

    return promise;
  };
}
