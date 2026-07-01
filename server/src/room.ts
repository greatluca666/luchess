// server/src/room.ts
import type WebSocket from 'ws';
import { applyMove, createGame, type MoveInput } from './chessRules.js';
import { generateToken } from './idGen.js';

export type Color = 'white' | 'black';
export type Seat = Color | 'spectator';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface StateSnapshot {
  roomId: string;
  status: RoomStatus;
  fen: string;
  turn: Color;
  historySan: string[];
  clocks: { white: number; black: number };
  timeControlMs: number;
  drawOfferBy: Color | null;
  undoOfferBy: Color | null;
  result: string | null;
  resultReason: string | null;
}

interface SeatInfo {
  ws: WebSocket | null;
  token: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export class Room {
  readonly id: string;
  readonly timeControlMs: number;
  status: RoomStatus = 'waiting';
  drawOfferBy: Color | null = null;
  undoOfferBy: Color | null = null;
  result: string | null = null;
  resultReason: string | null = null;
  finishedAt: number | null = null;

  private readonly now: () => number;
  private readonly colorPref: Color | 'random';
  private chess = createGame();
  private clocks: { white: number; black: number };
  private lastMoveAt: number | null = null;
  private seats: { white: SeatInfo | null; black: SeatInfo | null } = { white: null, black: null };
  private connections = new Map<WebSocket, Seat>();
  private persisted = false;

  constructor(id: string, timeControlMs: number, colorPref: Color | 'random', now: () => number = Date.now) {
    this.id = id;
    this.timeControlMs = timeControlMs;
    this.clocks = { white: timeControlMs, black: timeControlMs };
    this.colorPref = colorPref;
    this.now = now;
  }

  connect(ws: WebSocket, token?: string): { seat: Seat; token?: string } {
    for (const color of ['white', 'black'] as Color[]) {
      const seat = this.seats[color];
      if (seat && token && seat.token === token) {
        seat.ws = ws;
        this.connections.set(ws, color);
        return { seat: color };
      }
    }

    const openColor = this.pickOpenSeat();
    if (openColor) {
      const newToken = generateToken();
      this.seats[openColor] = { ws, token: newToken };
      this.connections.set(ws, openColor);
      if (this.seats.white && this.seats.black && this.status === 'waiting') {
        this.status = 'playing';
        this.lastMoveAt = this.now();
      }
      return { seat: openColor, token: newToken };
    }

    this.connections.set(ws, 'spectator');
    return { seat: 'spectator' };
  }

  disconnect(ws: WebSocket): void {
    this.connections.delete(ws);
    for (const color of ['white', 'black'] as Color[]) {
      if (this.seats[color]?.ws === ws) {
        this.seats[color]!.ws = null;
      }
    }
  }

  private pickOpenSeat(): Color | null {
    const whiteOpen = !this.seats.white;
    const blackOpen = !this.seats.black;
    if (!whiteOpen && !blackOpen) return null;
    if (whiteOpen && blackOpen) {
      return this.colorPref === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : this.colorPref;
    }
    return whiteOpen ? 'white' : 'black';
  }

  hasActiveConnections(): boolean {
    return this.connections.size > 0;
  }

  move(seat: Seat, input: MoveInput): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot move' };
    const turnColor: Color = this.chess.turn() === 'w' ? 'white' : 'black';
    if (seat !== turnColor) return { ok: false, error: 'not your turn' };

    const result = applyMove(this.chess, input);
    if (!result.ok) return { ok: false, error: result.error };

    const now = this.now();
    if (this.timeControlMs > 0 && this.lastMoveAt !== null) {
      this.clocks[turnColor] = Math.max(0, this.clocks[turnColor] - (now - this.lastMoveAt));
    }
    this.lastMoveAt = now;
    this.drawOfferBy = null;
    this.undoOfferBy = null;

    if (result.gameOver) {
      this.finish(result.result!, result.resultReason!);
    }
    return { ok: true };
  }

  resign(seat: Seat): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot resign' };
    this.finish(seat === 'white' ? '0-1' : '1-0', 'resignation');
    return { ok: true };
  }

  offerDraw(seat: Seat): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot offer draw' };
    this.drawOfferBy = seat;
    return { ok: true };
  }

  respondDraw(seat: Seat, accept: boolean): ActionResult {
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot respond' };
    if (!this.drawOfferBy || this.drawOfferBy === seat) {
      return { ok: false, error: 'no pending draw offer for you' };
    }
    if (accept) this.finish('1/2-1/2', 'draw-agreement');
    this.drawOfferBy = null;
    return { ok: true };
  }

  offerUndo(seat: Seat): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot offer undo' };
    if (this.chess.history().length === 0) return { ok: false, error: 'no move to undo' };
    this.undoOfferBy = seat;
    return { ok: true };
  }

  respondUndo(seat: Seat, accept: boolean): ActionResult {
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot respond' };
    if (!this.undoOfferBy || this.undoOfferBy === seat) {
      return { ok: false, error: 'no pending undo offer for you' };
    }
    if (accept) {
      this.chess.undo();
      this.lastMoveAt = this.now();
    }
    this.undoOfferBy = null;
    return { ok: true };
  }

  checkTimeout(): boolean {
    if (this.status !== 'playing' || this.timeControlMs === 0 || this.lastMoveAt === null) return false;
    const turnColor: Color = this.chess.turn() === 'w' ? 'white' : 'black';
    const elapsed = this.now() - this.lastMoveAt;
    const remaining = this.clocks[turnColor] - elapsed;
    if (remaining <= 0) {
      this.clocks[turnColor] = 0;
      this.finish(turnColor === 'white' ? '0-1' : '1-0', 'timeout');
      return true;
    }
    return false;
  }

  getSnapshot(): StateSnapshot {
    const turnColor: Color = this.chess.turn() === 'w' ? 'white' : 'black';
    let clocks = { ...this.clocks };
    if (this.status === 'playing' && this.timeControlMs > 0 && this.lastMoveAt !== null) {
      const elapsed = this.now() - this.lastMoveAt;
      clocks = { ...clocks, [turnColor]: Math.max(0, clocks[turnColor] - elapsed) };
    }
    return {
      roomId: this.id,
      status: this.status,
      fen: this.chess.fen(),
      turn: turnColor,
      historySan: this.chess.history(),
      clocks,
      timeControlMs: this.timeControlMs,
      drawOfferBy: this.drawOfferBy,
      undoOfferBy: this.undoOfferBy,
      result: this.result,
      resultReason: this.resultReason,
    };
  }

  getPgn(): string {
    return this.chess.pgn();
  }

  seatColorFor(ws: WebSocket): Seat | undefined {
    return this.connections.get(ws);
  }

  allConnections(): WebSocket[] {
    return Array.from(this.connections.keys());
  }

  isPersisted(): boolean {
    return this.persisted;
  }

  markPersisted(): void {
    this.persisted = true;
  }

  private finish(result: string, resultReason: string): void {
    this.status = 'finished';
    this.result = result;
    this.resultReason = resultReason;
    this.finishedAt = this.now();
  }
}
