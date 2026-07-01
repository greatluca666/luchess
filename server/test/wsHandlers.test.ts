import { describe, it, expect, vi } from 'vitest';
import type WebSocket from 'ws';
import { handleMessage } from '../src/wsHandlers.js';

function fakeWs(): WebSocket {
  return { readyState: 1, OPEN: 1, send: vi.fn() } as unknown as WebSocket;
}

describe('handleMessage', () => {
  it('routes a move message to room.move with the caller seat', () => {
    const ws = fakeWs();
    const room = { seatColorFor: () => 'white', move: vi.fn().mockReturnValue({ ok: true }) } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    expect(room.move).toHaveBeenCalledWith('white', { from: 'e2', to: 'e4', promotion: undefined });
  });

  it('sends an error back when the connection has no seat', () => {
    const ws = fakeWs();
    const room = { seatColorFor: () => undefined } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('not connected to a seat'));
  });

  it('sends an error for an unknown message type', () => {
    const ws = fakeWs();
    const room = { seatColorFor: () => 'white' } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'nonsense' }));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('unknown message type'));
  });

  it('sends an error for malformed JSON', () => {
    const ws = fakeWs();
    const room = { seatColorFor: () => 'white' } as any;
    handleMessage(room, ws, '{not json');
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('invalid message'));
  });
});
