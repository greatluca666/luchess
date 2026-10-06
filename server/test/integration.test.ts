// server/test/integration.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';

describe('full game integration', () => {
  let server: http.Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it('plays a full game to checkmate over websockets and persists it', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;

    const createRes = await fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControlMs: 0, colorPref: 'white' }),
    });
    const { roomId } = await createRes.json();

    const clientA = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    const clientB = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);

    const joinedA = await waitForMessage(clientA, (m) => m.type === 'joined');
    await waitForMessage(clientB, (m) => m.type === 'joined');
    const white = joinedA.seat === 'white' ? clientA : clientB;
    const black = joinedA.seat === 'white' ? clientB : clientA;

    const moves = [
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ];
    let finalState: any;
    for (let i = 0; i < moves.length; i++) {
      const mover = i % 2 === 0 ? white : black;
      const opponent = mover === white ? black : white;
      const expectedLength = i + 1;
      const statePromise = waitForMessage(
        opponent,
        (m) => m.type === 'state' && m.historySan.length === expectedLength
      );
      mover.send(JSON.stringify({ type: 'move', ...moves[i] }));
      finalState = await statePromise;
    }

    expect(finalState.status).toBe('finished');
    expect(finalState.result).toBe('0-1');
    expect(finalState.resultReason).toBe('checkmate');

    const gamesRes = await fetch(`${base}/api/games`);
    const games = await gamesRes.json();
    expect(games).toHaveLength(1);
    // Games are stored under their own id, so one room can hold many games.
    expect(games[0].id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(games[0].id).not.toBe(roomId);
    expect(games[0].result).toBe('0-1');

    clientA.close();
    clientB.close();
  });

  it('sends each fog of war player their own masked state and persists the game as fogofwar', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;

    const createRes = await fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControlMs: 0, colorPref: 'white', variant: 'fogofwar' }),
    });
    const { roomId } = await createRes.json();

    const white = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    await waitForMessage(white, (m) => m.type === 'joined');
    const black = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    await waitForMessage(black, (m) => m.type === 'joined');

    const whiteState = waitForMessage(white, (m) => m.type === 'state' && m.historySan.length === 1);
    const blackState = waitForMessage(black, (m) => m.type === 'state' && m.historySan.length === 1);
    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const [w, b] = await Promise.all([whiteState, blackState]);
    expect(w.historySan).toEqual(['e2e4']);
    expect(/[a-z]/.test(w.fen.split(' ')[0])).toBe(false);
    expect(b.historySan).toEqual(['?']);
    expect(/[A-Z]/.test(b.fen.split(' ')[0])).toBe(false);

    const finished = waitForMessage(white, (m) => m.type === 'state' && m.status === 'finished');
    black.send(JSON.stringify({ type: 'resign' }));
    await finished;

    const games = await (await fetch(`${base}/api/games`)).json();
    expect(games[0].variant).toBe('fogofwar');
    expect(games[0].pgn).toBe('1. e2e4');

    white.close();
    black.close();
  });

  it('reports whether a room code exists', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const { roomId } = await (
      await fetch(`${base}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControlMs: 0, colorPref: 'white' }),
      })
    ).json();

    const found = await fetch(`${base}/api/rooms/${roomId}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ roomId, status: 'waiting' });

    // Codes start at 100000, so this one can never exist.
    expect((await fetch(`${base}/api/rooms/000000`)).status).toBe(404);
  });

  it('plays a rematch in the same room with colours swapped and stores both games', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;
    const { roomId } = await (
      await fetch(`${base}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControlMs: 0, colorPref: 'white' }),
      })
    ).json();

    const a = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    expect((await waitForMessage(a, (m) => m.type === 'joined')).seat).toBe('white');
    const b = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    await waitForMessage(b, (m) => m.type === 'joined');

    const over1 = waitForMessage(b, (m) => m.type === 'state' && m.status === 'finished');
    a.send(JSON.stringify({ type: 'resign' }));
    await over1;

    const offered = waitForMessage(b, (m) => m.type === 'state' && m.rematchOfferBy === 'white');
    a.send(JSON.stringify({ type: 'offerRematch' }));
    await offered;
    const restartA = waitForMessage(a, (m) => m.type === 'state' && m.status === 'playing');
    const restartB = waitForMessage(b, (m) => m.type === 'state' && m.status === 'playing');
    b.send(JSON.stringify({ type: 'respondRematch', accept: true }));
    const [stateA, stateB] = await Promise.all([restartA, restartB]);
    expect(stateA.seat).toBe('black');
    expect(stateB.seat).toBe('white');
    expect(stateA.historySan).toEqual([]);

    const over2 = waitForMessage(a, (m) => m.type === 'state' && m.status === 'finished');
    b.send(JSON.stringify({ type: 'resign' }));
    await over2;

    const games = await (await fetch(`${base}/api/games`)).json();
    expect(games).toHaveLength(2);
    expect(games[0].id).not.toBe(games[1].id);
    for (const game of games) expect(game.id).not.toBe(roomId);

    a.close();
    b.close();
  });
});

function waitForMessage(ws: WebSocket, predicate: (msg: any) => boolean): Promise<any> {
  return new Promise((resolve) => {
    const handler = (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (predicate(msg)) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}
