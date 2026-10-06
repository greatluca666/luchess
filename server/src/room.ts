// server/src/room.ts
import type WebSocket from 'ws';
import {
  applyMove,
  createGame,
  toChessopsMove,
  type GameOverResult,
  type MoveInput,
} from './chessRules.js';
import { fogDests, fogMoves, fogOutcome, maskedFen, visibleSquares } from './fogOfWar.js';
import { normalizeMove, type Position } from 'chessops/chess';
import { isNormal, type Move, type Rules } from 'chessops/types';
import { makeFen } from 'chessops/fen';
import { makeSquare, makeUci } from 'chessops/util';
import { generateGameId, generateToken } from './idGen.js';

const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

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
  variant: Rules;
  chess960: boolean;
  checksRemaining: { white: number; black: number } | null;
  startFen: string;
  // Fog of War: `fog` is set for the whole game. While it is unfinished,
  // `fen` / `historySan` are the viewer's masked versions, `visible` lists
  // the squares they can see and `dests` their legal moves (the masked board
  // is not enough to compute them client-side). null outside fog games and
  // once a fog game is over.
  fog: boolean;
  visible: string[] | null;
  dests: Record<string, string[]> | null;
}

interface SeatInfo {
  ws: WebSocket | null;
  token: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface PlayedMove {
  move: Move;
  notation: string;
  outcome: GameOverResult;
}

export class Room {
  readonly id: string;
  readonly timeControlMs: number;
  readonly incrementMs: number;
  // Database id of the game currently being played in this room.
  gameId: string;
  status: RoomStatus = 'waiting';
  drawOfferBy: Color | null = null;
  undoOfferBy: Color | null = null;
  result: string | null = null;
  resultReason: string | null = null;
  finishedAt: number | null = null;

  private readonly now: () => number;
  private readonly colorPref: Color | 'random';
  private readonly rules: Rules;
  private readonly chess960: boolean;
  private readonly fog: boolean;
  private chess: Position;
  private readonly initialFen: string;
  private moveHistorySan: string[] = [];
  private moves: Move[] = [];
  private repetitionCounts = new Map<string, number>();
  private clocks: { white: number; black: number };
  private lastMoveAt: number | null = null;
  private seats: { white: SeatInfo | null; black: SeatInfo | null } = { white: null, black: null };
  private connections = new Map<WebSocket, Seat>();
  private persisted = false;

  constructor(
    id: string,
    timeControlMs: number,
    colorPref: Color | 'random',
    now: () => number = Date.now,
    startFen?: string,
    rules: Rules = 'chess',
    chess960: boolean = false,
    incrementMs: number = 0,
    fog: boolean = false
  ) {
    this.id = id;
    this.timeControlMs = timeControlMs;
    this.incrementMs = incrementMs;
    this.clocks = { white: timeControlMs, black: timeControlMs };
    this.colorPref = colorPref;
    this.now = now;
    this.rules = rules;
    this.chess960 = chess960;
    this.fog = fog;
    this.gameId = generateGameId();
    this.chess = createGame(rules, startFen);
    this.initialFen = makeFen(this.chess.toSetup());
    // The game's starting position is itself the first occurrence for
    // threefold-repetition purposes (per the FIDE rule), so it must be
    // recorded once here — otherwise a position that returns to the exact
    // start only twice via played moves would never reach a recorded count
    // of 3.
    this.recordAndCountRepetition();
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
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    if (seat !== turnColor) return { ok: false, error: 'not your turn' };

    const played = this.fog ? this.playFogMove(input) : this.playStandardMove(input);
    if (!played) return { ok: false, error: 'illegal move' };

    this.moveHistorySan.push(played.notation);
    this.moves.push(played.move);
    const repetitionCount = this.recordAndCountRepetition();

    const now = this.now();
    if (this.timeControlMs > 0 && this.lastMoveAt !== null) {
      this.clocks[turnColor] = Math.max(0, this.clocks[turnColor] - (now - this.lastMoveAt)) + this.incrementMs;
    }
    this.lastMoveAt = now;
    this.drawOfferBy = null;
    this.undoOfferBy = null;

    if (played.outcome.gameOver) {
      this.finish(played.outcome.result!, played.outcome.resultReason!);
    } else if (this.chess.halfmoves >= 100) {
      this.finish('1/2-1/2', 'fifty-move');
    } else if (repetitionCount >= 3) {
      this.finish('1/2-1/2', 'threefold-repetition');
    }
    return { ok: true };
  }

  private playStandardMove(input: MoveInput): PlayedMove | undefined {
    const move = toChessopsMove(this.chess, input);
    if (!move) return undefined;
    const result = applyMove(this.chess, input);
    if (!result.ok) return undefined;
    return { move, notation: result.san!, outcome: result };
  }

  // Fog of War moves are recorded as UCI: plenty of them (a king stepping
  // into attack, ignoring a check) are illegal chess, which SAN can't express.
  private playFogMove(input: MoveInput): PlayedMove | undefined {
    const requested = toChessopsMove(this.chess, input);
    if (!requested || !isNormal(requested)) return undefined;
    // Turns a two-square king drag (e1-g1) into chessops' king-takes-rook
    // castling encoding (e1-h1), which is what fogMoves() produces.
    const wanted = normalizeMove(this.chess, requested);
    if (!isNormal(wanted)) return undefined;
    const move = fogMoves(this.chess).find(
      (m) => m.from === wanted.from && m.to === wanted.to && m.promotion === wanted.promotion
    );
    if (!move) return undefined;
    const mover = this.chess.turn;
    this.chess.play(move);
    return { move, notation: makeUci(move), outcome: fogOutcome(this.chess, mover) };
  }

  private recordAndCountRepetition(): number {
    const key = makeFen(this.chess.toSetup(), { epd: true });
    const count = (this.repetitionCounts.get(key) ?? 0) + 1;
    this.repetitionCounts.set(key, count);
    return count;
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
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
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
    if (this.moves.length === 0) return { ok: false, error: 'no move to undo' };
    this.undoOfferBy = seat;
    return { ok: true };
  }

  respondUndo(seat: Seat, accept: boolean): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot respond' };
    if (!this.undoOfferBy || this.undoOfferBy === seat) {
      return { ok: false, error: 'no pending undo offer for you' };
    }
    if (accept) {
      this.moveHistorySan.pop();
      this.moves.pop();
      this.rebuildPosition();
      this.lastMoveAt = this.now();
    }
    this.undoOfferBy = null;
    return { ok: true };
  }

  private rebuildPosition(): void {
    this.chess = createGame(this.rules, this.initialFen);
    this.repetitionCounts.clear();
    // The rebuilt starting position is occurrence #1, exactly like a fresh
    // room's constructor counts its own starting position — undo must not
    // shift the repetition baseline relative to a room that never undid.
    this.recordAndCountRepetition();
    for (const m of this.moves) {
      this.chess.play(m);
      this.recordAndCountRepetition();
    }
  }

  checkTimeout(): boolean {
    if (this.status !== 'playing' || this.timeControlMs === 0 || this.lastMoveAt === null) return false;
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    const elapsed = this.now() - this.lastMoveAt;
    const remaining = this.clocks[turnColor] - elapsed;
    if (remaining <= 0) {
      this.clocks[turnColor] = 0;
      this.finish(turnColor === 'white' ? '0-1' : '1-0', 'timeout');
      return true;
    }
    return false;
  }

  getSnapshot(viewer: Seat = 'spectator'): StateSnapshot {
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    let clocks = { ...this.clocks };
    if (this.status === 'playing' && this.timeControlMs > 0 && this.lastMoveAt !== null) {
      const elapsed = this.now() - this.lastMoveAt;
      clocks = { ...clocks, [turnColor]: Math.max(0, clocks[turnColor] - elapsed) };
    }
    const remainingChecks = this.chess.remainingChecks;
    const snapshot: StateSnapshot = {
      roomId: this.id,
      status: this.status,
      fen: makeFen(this.chess.toSetup()),
      turn: turnColor,
      historySan: this.moveHistorySan,
      clocks,
      timeControlMs: this.timeControlMs,
      drawOfferBy: this.drawOfferBy,
      undoOfferBy: this.undoOfferBy,
      result: this.result,
      resultReason: this.resultReason,
      variant: this.rules,
      chess960: this.chess960,
      checksRemaining: remainingChecks ? { white: remainingChecks.white, black: remainingChecks.black } : null,
      startFen: this.initialFen,
      fog: this.fog,
      visible: null,
      dests: null,
    };
    if (!this.fog || this.status === 'finished') return snapshot;
    return { ...snapshot, ...this.fogView(viewer) };
  }

  private fogView(viewer: Seat): Pick<StateSnapshot, 'fen' | 'historySan' | 'visible' | 'dests'> {
    if (viewer === 'spectator') {
      return { fen: EMPTY_BOARD_FEN, historySan: this.moveHistorySan.map(() => '?'), visible: [], dests: {} };
    }
    // Fog of War always starts from the standard position, so white's moves
    // are the even plies.
    const ownParity = viewer === 'white' ? 0 : 1;
    const myTurn = this.status === 'playing' && this.chess.turn === viewer;
    return {
      fen: maskedFen(this.chess, viewer),
      historySan: this.moveHistorySan.map((uci, i) => (i % 2 === ownParity ? uci : '?')),
      visible: Array.from(visibleSquares(this.chess, viewer), (square) => makeSquare(square)),
      dests: myTurn ? fogDests(this.chess) : {},
    };
  }

  getPgn(): string {
    const parts: string[] = [];
    this.moveHistorySan.forEach((san, i) => {
      if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
      parts.push(san);
    });
    return parts.join(' ');
  }

  getInitialFen(): string {
    return this.initialFen;
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
