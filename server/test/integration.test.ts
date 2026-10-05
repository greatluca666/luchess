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
    expect(games[0].id).toBe(roomId);
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
