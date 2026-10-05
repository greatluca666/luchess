// server/src/app.ts
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './roomManager.js';
import { openDb, saveGame, listGames, getGame } from './db.js';
import { handleMessage } from './wsHandlers.js';
import type { Color, Room } from './room.js';
import { generateChess960Fen } from './chess960.js';
import type { Rules } from 'chessops/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIST = path.join(__dirname, '../../client/dist');

export interface AppOptions {
  dbPath: string;
  clientDist?: string;
}

export function createApp(options: AppOptions): http.Server {
  const clientDist = options.clientDist ?? DEFAULT_CLIENT_DIST;
  const db = openDb(options.dbPath);
  const roomManager = new RoomManager();
  const cleanupTimer = roomManager.startCleanupLoop();

  const app = express();
  app.use(express.json());
  app.use(express.static(clientDist));

  app.post('/api/games', (req, res) => {
    const { timeControlMs, incrementMs, colorPref, variant } = req.body ?? {};
    const validTime = typeof timeControlMs === 'number' && timeControlMs >= 0 ? timeControlMs : 0;
    const validIncrement = typeof incrementMs === 'number' && incrementMs >= 0 ? incrementMs : 0;
    const validColor: Color | 'random' =
      colorPref === 'white' || colorPref === 'black' ? colorPref : 'random';

    let rules: Rules = 'chess';
    let chess960 = false;
    let startFen: string | undefined;
    if (variant === 'chess960') {
      chess960 = true;
      startFen = generateChess960Fen();
    } else if (
      variant === '3check' ||
      variant === 'kingofthehill' ||
      variant === 'atomic' ||
      variant === 'antichess' ||
      variant === 'racingkings' ||
      variant === 'horde' ||
      variant === 'crazyhouse'
    ) {
      rules = variant;
    }

    const room = roomManager.createRoom(validTime, validColor, rules, startFen, chess960, validIncrement);
    res.json({ roomId: room.id });
  });

  app.get('/api/games', (_req, res) => {
    res.json(listGames(db));
  });

  app.get('/api/games/:id', (req, res) => {
    const game = getGame(db, req.params.id);
    if (!game) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(game);
  });

  app.get('/game/:roomId', (_req, res) => {
    res.sendFile(path.join(clientDist, 'game.html'));
  });

  app.get('/games', (_req, res) => {
    res.sendFile(path.join(clientDist, 'games.html'));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const match = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (!match) {
      ws.close(1008, 'invalid room path');
      return;
    }
    const room = roomManager.get(match[1]);
    if (!room) {
      ws.close(1008, 'room not found');
      return;
    }
    const token = url.searchParams.get('token') ?? undefined;
    const { seat, token: newToken } = room.connect(ws, token);
    ws.send(JSON.stringify({ type: 'joined', seat, token: newToken }));
    broadcastState(room);

    ws.on('message', (raw) => {
      handleMessage(room, ws, raw.toString());
      persistIfFinished(room);
      broadcastState(room);
    });

    ws.on('close', () => {
      room.disconnect(ws);
    });
  });

  function broadcastState(room: Room): void {
    const snapshot = JSON.stringify({ type: 'state', ...room.getSnapshot() });
    for (const conn of room.allConnections()) {
      if (conn.readyState === WebSocket.OPEN) conn.send(snapshot);
    }
  }

  function persistIfFinished(room: Room): void {
    if (room.status === 'finished' && !room.isPersisted()) {
      const snapshot = room.getSnapshot();
      saveGame(db, {
        id: room.id,
        pgn: room.getPgn(),
        result: room.result!,
        resultReason: room.resultReason!,
        whiteTimeMs: snapshot.clocks.white,
        blackTimeMs: snapshot.clocks.black,
        timeControlMs: room.timeControlMs,
        finishedAt: room.finishedAt!,
        variant: snapshot.chess960 ? 'chess960' : snapshot.variant,
        startFen: room.getInitialFen(),
      });
      room.markPersisted();
    }
  }

  const tickTimer = setInterval(() => {
    for (const room of roomManager.allRooms()) {
      if (room.status !== 'playing') continue;
      const timedOut = room.checkTimeout();
      if (timedOut) persistIfFinished(room);
      broadcastState(room);
    }
  }, 1000);

  server.on('close', () => {
    clearInterval(tickTimer);
    clearInterval(cleanupTimer);
    db.close();
  });

  return server;
}
