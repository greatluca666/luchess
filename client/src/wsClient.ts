export interface WsClientOptions {
  roomId: string;
  onMessage(msg: any): void;
  onOpen?(): void;
}

const TOKEN_PREFIX = 'luchess:room:';

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly roomId: string;
  private readonly onMessage: (msg: any) => void;
  private readonly onOpen?: () => void;
  private closedByUser = false;

  constructor(options: WsClientOptions) {
    this.roomId = options.roomId;
    this.onMessage = options.onMessage;
    this.onOpen = options.onOpen;
    this.connect();
  }

  private connect(): void {
    const token = localStorage.getItem(TOKEN_PREFIX + this.roomId);
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}/ws/${this.roomId}${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('open', () => this.onOpen?.());
    ws.addEventListener('message', (event: any) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'joined' && msg.token) {
        localStorage.setItem(TOKEN_PREFIX + this.roomId, msg.token);
      }
      this.onMessage(msg);
    });
    ws.addEventListener('close', () => {
      if (!this.closedByUser) setTimeout(() => this.connect(), 1000);
    });
  }

  send(msg: any): void {
    this.ws?.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }
}
