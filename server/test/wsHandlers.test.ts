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

  it('routes a crazyhouse drop message to room.move as a drop', () => {
    const ws = fakeWs();
    const room = { seatColorFor: () => 'white', move: vi.fn().mockReturnValue({ ok: true }) } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'move', drop: 'knight', to: 'f3' }));
    expect(room.move).toHaveBeenCalledWith('white', { drop: 'knight', to: 'f3' });
  });

  it('routes rematch offers and answers', () => {
    const ws = fakeWs();
    const room = {
      seatColorFor: () => 'black',
      offerRematch: vi.fn().mockReturnValue({ ok: true }),
      respondRematch: vi.fn().mockReturnValue({ ok: true }),
    } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'offerRematch' }));
    handleMessage(room, ws, JSON.stringify({ type: 'respondRematch', accept: true }));
    expect(room.offerRematch).toHaveBeenCalledWith('black');
    expect(room.respondRematch).toHaveBeenCalledWith('black', true);
  });
});
