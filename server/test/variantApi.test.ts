import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';

describe('variant selection over the API', () => {
  let server: http.Server | undefined;

  afterEach(() => {
    server?.close();
  });

  async function createAppAndConnect(variant: string): Promise<{ base: string; port: number; ws: WebSocket; state: any }> {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server!.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;

    const createRes = await fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControlMs: 0, colorPref: 'white', variant }),
    });
    const { roomId } = await createRes.json();

    const ws = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    const state = await new Promise<any>((resolve) => {
      const handler = (raw: any) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'state') {
          ws.off('message', handler);
          resolve(msg);
        }
      };
      ws.on('message', handler);
    });
    return { base, port, ws, state };
  }

  it('creates a 3check room with the 3check rules and initial checksRemaining', async () => {
    const { ws, state } = await createAppAndConnect('3check');
    expect(state.variant).toBe('3check');
    expect(state.chess960).toBe(false);
    expect(state.checksRemaining).toEqual({ white: 3, black: 3 });
    ws.close();
  });

  it('creates a King of the Hill room with the kingofthehill rules', async () => {
    const { ws, state } = await createAppAndConnect('kingofthehill');
    expect(state.variant).toBe('kingofthehill');
    expect(state.chess960).toBe(false);
    expect(state.checksRemaining).toBeNull();
    ws.close();
  });

  it('creates a Chess960 room with chess rules but a randomized starting FEN', async () => {
    const { ws, state } = await createAppAndConnect('chess960');
    expect(state.variant).toBe('chess');
    expect(state.chess960).toBe(true);
    expect(state.fen.split(' ')[0]).not.toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.split(' ')[0]);
    ws.close();
  });

  it('falls back to standard chess for an unrecognized variant value', async () => {
    const { ws, state } = await createAppAndConnect('not-a-real-variant');
    expect(state.variant).toBe('chess');
    expect(state.chess960).toBe(false);
    ws.close();
  });

  it('creates a Crazyhouse room whose FEN carries (empty) pockets', async () => {
    const { ws, state } = await createAppAndConnect('crazyhouse');
    expect(state.variant).toBe('crazyhouse');
    expect(state.fen.split(' ')[0].endsWith('[]')).toBe(true);
    ws.close();
  });
});
