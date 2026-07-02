// server/test/room.test.ts
import { describe, it, expect, vi } from 'vitest';
import type WebSocket from 'ws';
import { Room } from '../src/room.js';

function fakeWs(): WebSocket {
  return { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

describe('Room', () => {
  it('assigns the requested color to the first connection and the other color to the second', () => {
    const room = new Room('r1', 0, 'white');
    const a = room.connect(fakeWs());
    const b = room.connect(fakeWs());
    expect(a.seat).toBe('white');
    expect(b.seat).toBe('black');
    expect(room.status).toBe('playing');
  });

  it('assigns a random color when colorPref is random', () => {
    const room = new Room('r1', 0, 'random');
    const a = room.connect(fakeWs());
    expect(['white', 'black']).toContain(a.seat);
  });

  it('assigns spectator once both seats are filled', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const c = room.connect(fakeWs());
    expect(c.seat).toBe('spectator');
  });

  it('reconnects a seat using its token instead of assigning a new one', () => {
    const room = new Room('r1', 0, 'white');
    const first = room.connect(fakeWs());
    room.connect(fakeWs());
    const reconnected = room.connect(fakeWs(), first.token);
    expect(reconnected.seat).toBe('white');
  });

  it('only allows the player whose turn it is to move', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.move('black', { from: 'e7', to: 'e5' }).ok).toBe(false);
    expect(room.move('white', { from: 'e2', to: 'e4' }).ok).toBe(true);
  });

  it('rejects moves from spectators', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.move('spectator', { from: 'e2', to: 'e4' }).ok).toBe(false);
  });

  it('ends the game on resignation with the opponent winning', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const res = room.resign('white');
    expect(res.ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('0-1');
    expect(room.resultReason).toBe('resignation');
  });

  it('ends the game as a draw when both players agree', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.offerDraw('white');
    const res = room.respondDraw('black', true);
    expect(res.ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1/2-1/2');
    expect(room.resultReason).toBe('draw-agreement');
  });

  it('keeps playing when a draw offer is rejected', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.offerDraw('white');
    room.respondDraw('black', false);
    expect(room.status).toBe('playing');
    expect(room.drawOfferBy).toBeNull();
  });

  it('rejects a draw response after the game has already finished by another route', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.offerDraw('white');
    room.resign('white');
    expect(room.result).toBe('0-1');
    const res = room.respondDraw('black', true);
    expect(res.ok).toBe(false);
    expect(room.result).toBe('0-1');
  });

  it('rejects an undo response after the game has already finished by another route', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.move('white', { from: 'e2', to: 'e4' });
    room.offerUndo('white');
    room.resign('white');
    expect(room.result).toBe('0-1');
    const res = room.respondUndo('black', true);
    expect(res.ok).toBe(false);
    expect(room.getSnapshot().historySan).toContain('e4');
  });

  it('undoes the last move when the opponent accepts', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.move('white', { from: 'e2', to: 'e4' });
    room.offerUndo('white');
    const res = room.respondUndo('black', true);
    expect(res.ok).toBe(true);
    expect(room.getSnapshot().historySan).toEqual([]);
    expect(room.getSnapshot().turn).toBe('white');
  });

  it('clears pending offers when a move is made', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.offerDraw('white');
    room.move('white', { from: 'e2', to: 'e4' });
    expect(room.drawOfferBy).toBeNull();
  });

  it('declares the player on the clock the loser when their time runs out', () => {
    let now = 1_000_000;
    const room = new Room('r1', 60_000, 'white', () => now);
    room.connect(fakeWs());
    room.connect(fakeWs());
    now += 61_000;
    expect(room.checkTimeout()).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('0-1');
    expect(room.resultReason).toBe('timeout');
  });

  it('never times out when the time control is unlimited', () => {
    let now = 1_000_000;
    const room = new Room('r1', 0, 'white', () => now);
    room.connect(fakeWs());
    room.connect(fakeWs());
    now += 999_999_999;
    expect(room.checkTimeout()).toBe(false);
    expect(room.status).toBe('playing');
  });

  it('declares a draw by threefold repetition when the same position recurs three times', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const knightShuffle: Array<{ color: 'white' | 'black'; from: string; to: string }> = [
      { color: 'white', from: 'g1', to: 'f3' },
      { color: 'black', from: 'g8', to: 'f6' },
      { color: 'white', from: 'f3', to: 'g1' },
      { color: 'black', from: 'f6', to: 'g8' },
    ];
    for (let round = 0; round < 2; round++) {
      for (const step of knightShuffle) {
        const result = room.move(step.color, { from: step.from, to: step.to });
        expect(result.ok).toBe(true);
      }
    }
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1/2-1/2');
    expect(room.resultReason).toBe('threefold-repetition');
  });

  it('declares a draw when the fifty-move counter reaches 100 halfmoves', () => {
    const room = new Room('r1', 0, 'white', Date.now, '8/8/8/4k3/8/4K3/8/7R w - - 99 60');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const result = room.move('white', { from: 'h1', to: 'h2' });
    expect(result.ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1/2-1/2');
    expect(room.resultReason).toBe('fifty-move');
  });
});
