import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsClient } from '../src/wsClient.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  listeners: Record<string, ((event: any) => void)[]> = {};
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, cb: (event: any) => void): void {
    (this.listeners[event] ??= []).push(cb);
  }

  emit(event: string, payload: any): void {
    for (const cb of this.listeners[event] ?? []) cb(payload);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  (globalThis as any).WebSocket = FakeWebSocket;
  (globalThis as any).location = { protocol: 'http:', host: 'localhost:3000' };
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WsClient', () => {
  it('connects to the room-scoped ws url without a token on first connect', () => {
    new WsClient({ roomId: 'abc123', onMessage: () => {} });
    expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:3000/ws/abc123');
  });

  it('stores the token from a joined message and uses it to reconnect', () => {
    new WsClient({ roomId: 'abc123', onMessage: () => {} });
    const first = FakeWebSocket.instances[0];
    first.emit('message', { data: JSON.stringify({ type: 'joined', seat: 'white', token: 'tok-1' }) });
    first.emit('close', {});
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances[1].url).toBe('ws://localhost:3000/ws/abc123?token=tok-1');
  });

  it('forwards parsed messages to onMessage', () => {
    const onMessage = vi.fn();
    new WsClient({ roomId: 'abc123', onMessage });
    const ws = FakeWebSocket.instances[0];
    ws.emit('message', { data: JSON.stringify({ type: 'state', fen: 'x' }) });
    expect(onMessage).toHaveBeenCalledWith({ type: 'state', fen: 'x' });
  });

  it('serializes messages sent through send()', () => {
    const client = new WsClient({ roomId: 'abc123', onMessage: () => {} });
    client.send({ type: 'resign' });
    expect(FakeWebSocket.instances[0].sent).toEqual([JSON.stringify({ type: 'resign' })]);
  });

  it('stops reconnecting and reports it when the server rejects the room', () => {
    const onFatal = vi.fn();
    new WsClient({ roomId: 'abc123', onMessage: () => {}, onFatal });
    FakeWebSocket.instances[0].emit('close', { code: 1008, reason: 'room not found' });
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(onFatal).toHaveBeenCalledWith('room not found');
  });
});
