const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECONNECT_DELAY_MS = 10000;
const PING_INTERVAL_MS = 5000;
const ACK_TIMEOUT_MS = 2000;

export type WebSocketMessage = { type: string } & Record<string, any>;
export type WebSocketStatus = 'init' | 'connected' | 'connecting' | 'offline' | 'error';

export class WebSocketManager<TMessage extends WebSocketMessage = WebSocketMessage> {
  reconnectTimer: number | null = null;
  reconnectAttempts: number = 0;

  pingTimer: number | null = null;
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

    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
  }

  connect = () => {
    if (!window.navigator.onLine) {
      console.warn('Cannot connect to WebSocket, browser is offline.');
      return;
    }

    console.log('Connecting to WebSocket at', this.wsURL);
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

  reconnect = () => {
    this.reconnectAttempts++;

    if (this.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);

      console.log(`WebSocket connect failed. Attempting to reconnect in ${delay} ms...`);

      this.reconnectTimer = window.setTimeout(this.connect, delay);
    } else {
      console.error('Max WebSocket reconnection attempts reached.');

      this.reconnectAttempts = 0;

      this.changeStatus('error');
      this.resetWS();
    }
  };

  resetWS = () => {
    this.clearPingTimer();
    this.clearReconnectTimer();

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
    console.log('Destroying WebSocketManager...');
    this.resetWS();

    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
  };

  handleWSOpen = () => {
    this.reconnectAttempts = 0;

    console.log('WebSocket connection established');
    this.changeStatus('connected');
    // this.schedulePing();
  };

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

  handleWSClose = (event: CloseEvent, ...args: any[]) => {
    console.log('WebSocket connection closed', event, args);

    if (window.navigator.onLine) {
      this.reconnect();
    }
  };

  handleOffline = () => {
    console.warn('Browser offline.');
    this.changeStatus('offline');
  };

  handleOnline = async () => {
    console.log('Browser online.');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('Testing connection.');
      await this.sendPing();
      this.changeStatus('connected');
    } else {
      this.connect();
    }
  };

  clearReconnectTimer = () => {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  clearPingTimer = () => {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
  };

  // schedulePing = () => {
  //   this.pingTimer = window.setTimeout(this.sendPing, PING_INTERVAL_MS);
  // };

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

      this.clearPingTimer();
      this.ws.send(JSON.stringify(message));
      // this.schedulePing();
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
