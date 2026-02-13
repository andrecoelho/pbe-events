const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECONNECT_DELAY_MS = 10000;
const ACK_TIMEOUT_MS = 2000;
const SERVER_TIMEOUT_MS = 10000;

export type WebSocketMessage = { type: string } & Record<string, any>;
export type WebSocketStatus = 'init' | 'connected' | 'connecting' | 'offline' | 'error';

export class WebSocketManager<TMessage extends WebSocketMessage = WebSocketMessage> {
  private ws: WebSocket | null = null;

  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private offlineTimer: number | null = null;
  private pendingACKs: Map<string, { resolve: (value: boolean) => void; timerId: number }> = new Map();
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
      navigator.wakeLock.request('screen');
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

  private handleWSClose = () => {
    const wasConnected = !!this.ws;

    this.reset();

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
        pending.resolve(true);
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
      if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
        try {
          await (navigator as any).wakeLock.request('screen');
        } catch (error) {
          // Failed to acquire wake lock; proceed without it
          console.error('Failed to acquire wake lock', error);
        }
      }
      await this.sendPing();
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
      pending.resolve(false);
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
    const { promise, resolve } = Promise.withResolvers<boolean>();

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
      resolve(false);
    }

    return promise;
  };
}
