const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECONNECT_DELAY_MS = 30000;
const PING_INTERVAL_MS = 30000;
const ACK_TIMEOUT_MS = 5000;

export type WebSocketMessage = { type: string } & Record<string, any>;
export type WebSocketStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export class WebSocketManager<TMessage extends WebSocketMessage = WebSocketMessage> {
  reconnectTimer: number | null = null;
  reconnectAttempts: number = 0;

  pingTimer: number | null = null;
  pendingACKs: Map<string, { resolve: (value: boolean) => void; timerId: number }> = new Map();

  status: WebSocketStatus = 'disconnected';
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
    if (window.navigator.onLine === false) {
      console.warn('Offline: WebSocket connection aborted.');
      return;
    }

    this.status = 'connecting';
    this.ws = new WebSocket(this.wsURL);

    this.ws.addEventListener('open', this.handleWSOpen);
    this.ws.addEventListener('message', this.handleWSMessage);
    this.ws.addEventListener('close', this.handleWSClose);
    this.ws.addEventListener('error', this.handleWSError);
    this.notifyStatusChange();
  };

  reconnect = () => {
    this.reconnectAttempts++;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);

      console.log(`WebSocket error. Attempting to reconnect in ${delay} ms...`);

      this.reconnectTimer = window.setTimeout(this.connect, delay);
    } else {
      console.error('Max WebSocket reconnection attempts reached.');

      this.status = 'error';
      this.reconnectAttempts = 0;

      this.notifyStatusChange();
    }
  };

  disconnect = () => {
    this.clearPingTimer();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.notifyStatusChange();
  };

  destroy = () => {
    this.disconnect();

    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
  };

  handleWSOpen = () => {
    this.reconnectAttempts = 0;
    this.status = 'connected';

    console.log('WebSocket connection established');
    this.notifyStatusChange();
    this.schedulePing();
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

  handleWSClose = () => {
    if (this.status === 'connected') {
      this.status = 'disconnected';
      console.log('WebSocket connection closed');

      this.notifyStatusChange();
    }
  };

  handleWSError = (error: Event) => {
    console.error('WebSocket error:', error);

    this.reconnect();
  };

  handleOffline = () => {
    console.warn('Browser went offline. Disconnecting WebSocket.');
    this.disconnect();
  };

  handleOnline = () => {
    console.log('Browser went online. Reconnecting WebSocket.');
    this.connect();
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

  schedulePing = () => {
    this.pingTimer = window.setTimeout(this.sendPing, PING_INTERVAL_MS);
  };

  sendPing = async () => {
    const result = await this.sendMessage({ type: 'PING' });

    if (!result) {
      this.disconnect();
      this.connect();
    }
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
          this.pendingACKs.delete(ackId);
          resolve(false);
        }, ACK_TIMEOUT_MS)
      });

      this.clearPingTimer();
      this.ws.send(JSON.stringify(message));
      this.schedulePing();
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message);
      resolve(false);
    }

    return promise;
  };

  notifyStatusChange = () => {
    if (this.onStatusChange) {
      this.onStatusChange(this.status);
    }
  };
}
