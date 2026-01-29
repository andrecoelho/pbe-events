const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECONNECT_DELAY_MS = 10000;
const ACK_TIMEOUT_MS = 2000;
const SERVER_TIMEOUT_MS = 10000;

export type WebSocketMessage = { type: string } & Record<string, any>;
export type WebSocketStatus = 'init' | 'connected' | 'connecting' | 'offline' | 'error';

export class WebSocketManager<TMessage extends WebSocketMessage = WebSocketMessage> {
  reconnectTimer: number | null = null;
  reconnectAttempts: number = 0;
  offlineTimer: number | null = null;
  pendingACKs: Map<string, { resolve: (value: boolean) => void; timerId: number }> = new Map();
  status: WebSocketStatus = 'init';
  wsURL: string;
  ws: WebSocket | null = null;
  onStatusChange?: (status: WebSocketStatus) => void;
  onMessage?: (message: TMessage) => void;

  constructor(
    wsURL: string,
    onStatusChange?: (status: WebSocketStatus) => void,
    onMessage?: (message: TMessage) => void
  ) {
    this.wsURL = wsURL;
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;

    navigator.wakeLock.request('screen');
    this.addEventListeners();
  }

  addEventListeners = () => {
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  };

  removeEventListeners = () => {
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  };

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
      this.ws.addEventListener('error', this.handleWSError);
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.changeStatus('connected');
    }
  };

  reconnect = () => {
    this.changeStatus('connecting');
    this.reconnectAttempts++;

    if (this.reconnectAttempts === 1) {
      this.connect();
      return;
    }

    if (this.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);

      this.reconnectTimer = window.setTimeout(this.connect, delay);
    } else {
      this.reconnectAttempts = 0;

      this.changeStatus('error');
      this.resetWS();
    }
  };

  resetWS = () => {
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
    this.resetWS();
    this.removeEventListeners();
  };

  handleWSOpen = () => {
    this.reconnectAttempts = 0;

    this.changeStatus('connected');
  };

  handleWSClose = () => {
    const needsReset = !!this.ws;

    this.resetWS();

    if (window.navigator.onLine) {
      if (needsReset) {
        this.reconnect();
      } else {
        this.connect();
      }
    }
  };

  handleWSError = (event: Event) => {
    console.log('WS error:', event);
  }

  handleWSMessage = (event: MessageEvent<string>) => {
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

  handleOffline = () => {
    this.changeStatus('offline');
    this.offlineTimer = window.setTimeout(this.resetWS, SERVER_TIMEOUT_MS);
  };

  handleOnline = async () => {
    this.clearOfflineTimer();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      await this.sendPing();
      this.changeStatus('connected');
    } else {
      this.connect();
    }
  };

  handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      navigator.wakeLock.request('screen');
      await this.sendPing();
    }
  };

  clearReconnectTimer = () => {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  clearOfflineTimer = () => {
    if (this.offlineTimer) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }
  };

  sendPing = async () => await this.sendMessage({ type: 'PING' });

  sendMessage = (message: WebSocketMessage) => {
    const { promise, resolve } = Promise.withResolvers<boolean>();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const ackId = crypto.randomUUID();
      message['__ACK__'] = ackId;

      this.pendingACKs.set(ackId, {
        resolve,
        timerId: window.setTimeout(() => {
          console.warn('ACK not received for message:', message);
          this.resetWS();
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

  changeStatus = (status: WebSocketStatus) => {
    this.status = status;

    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  };
}
