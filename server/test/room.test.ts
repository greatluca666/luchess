// server/test/room.test.ts
import { describe, it, expect, vi } from 'vitest';
import type WebSocket from 'ws';
import { Room } from '../src/room.js';
import { parseFen } from 'chessops/fen';

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

  it('adds the increment back to the mover\'s clock after each move', () => {
    let now = 1_000_000;
    const room = new Room('r1', 60_000, 'white', () => now, undefined, 'chess', false, 5_000);
    room.connect(fakeWs());
    room.connect(fakeWs());
    now += 10_000; // white thinks for 10s
    room.move('white', { from: 'e2', to: 'e4' });
    // 60_000 - 10_000 elapsed + 5_000 increment
    expect(room.getSnapshot().clocks.white).toBe(55_000);
  });

  it('does not add increment to an unlimited (0ms) time control', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'chess', false, 5_000);
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.move('white', { from: 'e2', to: 'e4' });
    expect(room.getSnapshot().clocks.white).toBe(0);
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

  it('counts the rebuilt starting position after an undo the same way a fresh game does', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    // Make one throwaway move then undo it, forcing rebuildPosition() back to the starting position.
    room.move('white', { from: 'a2', to: 'a3' });
    room.offerUndo('white');
    room.respondUndo('black', true);
    // Replay the same knight-shuffle-round-trip sequence the threefold test uses.
    // If rebuildPosition under-counts the rebuilt starting position, this would need
    // a 3rd round to trigger instead of 2, and the test would fail below.
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

  it('creates a room with alternate rules and reflects them in the snapshot', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'kingofthehill');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.getSnapshot().variant).toBe('kingofthehill');
    expect(room.getSnapshot().chess960).toBe(false);
  });

  it('reflects a chess960 flag independently of rules', () => {
    const chess960Fen = 'bqnrkbnr/pppppppp/8/8/8/8/PPPPPPPP/BQNRKBNR w KQkq - 0 1';
    const room = new Room('r1', 0, 'white', Date.now, chess960Fen, 'chess', true);
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.variant).toBe('chess');
    expect(snapshot.chess960).toBe(true);
    expect(snapshot.fen.startsWith('bqnrkbnr')).toBe(true);
  });

  it('exposes remaining checks for a 3check game and decrements after a real check', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, '3check');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.getSnapshot().checksRemaining).toEqual({ white: 3, black: 3 });

    expect(room.move('white', { from: 'e2', to: 'e4' }).ok).toBe(true);
    expect(room.move('black', { from: 'e7', to: 'e5' }).ok).toBe(true);
    expect(room.move('white', { from: 'd1', to: 'h5' }).ok).toBe(true);
    expect(room.move('black', { from: 'g7', to: 'g6' }).ok).toBe(true);
    expect(room.move('white', { from: 'h5', to: 'e5' }).ok).toBe(true); // captures the e5 pawn, checks black's king

    // chessops' remainingChecks is indexed by the color who *delivers* the
    // check (it counts down from 3 to 0 for the side racking up checks, and
    // that side wins at 0 — see RemainingChecks(3-white, 3-black) in
    // chessops' fen.ts and the this.remainingChecks[turn]-- in chess.ts
    // where `turn` is the mover, not the mover's opponent). White delivered
    // the check above, so white's counter is the one that drops.
    const snapshot = room.getSnapshot();
    expect(snapshot.checksRemaining).toEqual({ white: 2, black: 3 });
    expect(room.status).toBe('playing');
  });

  it('returns null checksRemaining for non-3check games', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.getSnapshot().checksRemaining).toBeNull();
  });

  it('ends a King of the Hill game the instant a king reaches a center square', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'kingofthehill');
    room.connect(fakeWs());
    room.connect(fakeWs());

    expect(room.move('white', { from: 'e2', to: 'e4' }).ok).toBe(true);
    expect(room.move('black', { from: 'a7', to: 'a6' }).ok).toBe(true);
    expect(room.move('white', { from: 'e1', to: 'e2' }).ok).toBe(true);
    expect(room.move('black', { from: 'a6', to: 'a5' }).ok).toBe(true);
    expect(room.move('white', { from: 'e2', to: 'd3' }).ok).toBe(true);
    expect(room.move('black', { from: 'a5', to: 'a4' }).ok).toBe(true);
    expect(room.move('white', { from: 'd3', to: 'd4' }).ok).toBe(true);

    expect(room.status).toBe('finished');
    expect(room.result).toBe('1-0');
    expect(room.resultReason).toBe('variant-end');
  });

  it('exposes startFen on every snapshot, matching the room\'s actual starting position', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('creates a Horde room with a real horde-shaped starting position (far more than 8 white pawns)', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'horde');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.variant).toBe('horde');
    const board = parseFen(snapshot.fen).unwrap().board;
    expect(board.pieces('white', 'pawn').size()).toBeGreaterThan(20);
    expect(board.pieces('black', 'queen').size()).toBe(1);
    expect(snapshot.startFen).toBe(snapshot.fen); // no moves played yet
  });

  it('creates a Racing Kings room with no pawns on the board for either side', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'racingkings');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.variant).toBe('racingkings');
    const board = parseFen(snapshot.fen).unwrap().board;
    expect(board.pieces('white', 'pawn').size()).toBe(0);
    expect(board.pieces('black', 'pawn').size()).toBe(0);
  });

  it('creates Atomic and Antichess rooms with the standard starting arrangement', () => {
    const atomicRoom = new Room('r1', 0, 'white', Date.now, undefined, 'atomic');
    atomicRoom.connect(fakeWs());
    atomicRoom.connect(fakeWs());
    expect(atomicRoom.getSnapshot().variant).toBe('atomic');
    const atomicBoard = parseFen(atomicRoom.getSnapshot().fen).unwrap().board;
    expect(atomicBoard.pieces('white', 'pawn').size()).toBe(8);
    expect(atomicBoard.pieces('black', 'king').size()).toBe(1);

    const antichessRoom = new Room('r2', 0, 'white', Date.now, undefined, 'antichess');
    antichessRoom.connect(fakeWs());
    antichessRoom.connect(fakeWs());
    expect(antichessRoom.getSnapshot().variant).toBe('antichess');
    const antichessBoard = parseFen(antichessRoom.getSnapshot().fen).unwrap().board;
    expect(antichessBoard.pieces('white', 'pawn').size()).toBe(8);
    expect(antichessBoard.pieces('black', 'king').size()).toBe(1);
  });

  it('lets a crazyhouse player drop a pocket piece and records it as N@ SAN', () => {
    const room = new Room(
      'r1', 0, 'white', Date.now,
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Nn] w KQkq - 0 1', 'crazyhouse'
    );
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.move('white', { drop: 'knight', to: 'e4' }).ok).toBe(true);
    const snapshot = room.getSnapshot();
    expect(snapshot.historySan).toEqual(['N@e4']);
    expect(snapshot.fen.startsWith('rnbqkbnr/pppppppp/8/8/4N3/8/PPPPPPPP/RNBQKBNR[n] b')).toBe(true);
  });

  it('rejects crazyhouse drops of missing pieces, pawns onto the back rank, and onto occupied squares', () => {
    const room = new Room('r1', 0, 'white', Date.now, '4k3/8/8/8/8/8/8/4K3[P] w - - 0 1', 'crazyhouse');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.move('white', { drop: 'queen', to: 'e4' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'a8' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'a1' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'e1' }).ok).toBe(false);
    expect(room.move('white', { drop: 'king', to: 'a4' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'a4' }).ok).toBe(true);
  });

  it('puts captured pieces into the capturer\'s crazyhouse pocket', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'crazyhouse');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.move('white', { from: 'e2', to: 'e4' });
    room.move('black', { from: 'd7', to: 'd5' });
    room.move('white', { from: 'e4', to: 'd5' });
    expect(room.getSnapshot().fen.split(' ')[0].endsWith('[P]')).toBe(true);
  });

  function fogRoom(startFen?: string): Room {
    const room = new Room('r1', 0, 'white', Date.now, startFen, 'chess', false, 0, true);
    room.connect(fakeWs());
    room.connect(fakeWs());
    return room;
  }

  it('fog: ignores check and ends the game when a king is captured', () => {
    const room = fogRoom();
    const moves: Array<['white' | 'black', string, string]> = [
      ['white', 'e2', 'e3'],
      ['black', 'f7', 'f6'],
      ['white', 'd1', 'h5'],
      ['black', 'a7', 'a6'], // ignores the "check" — legal in fog of war
      ['white', 'h5', 'e8'],
    ];
    for (const [color, from, to] of moves) expect(room.move(color, { from, to }).ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1-0');
    expect(room.resultReason).toBe('king-captured');
    expect(room.getSnapshot().historySan).toEqual(['e2e3', 'f7f6', 'd1h5', 'a7a6', 'h5e8']);
  });

  it('fog: rejects moves that are not even pseudo-legal', () => {
    expect(fogRoom().move('white', { from: 'e2', to: 'e5' }).ok).toBe(false);
  });

  it('fog: shows each player only what they can see and hides the opponent\'s moves', () => {
    const room = fogRoom();
    room.move('white', { from: 'e2', to: 'e4' });
    const white = room.getSnapshot('white');
    expect(white.fen.split(' ')[0]).toBe('8/8/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(white.historySan).toEqual(['e2e4']);
    expect(white.dests).toEqual({});
    const black = room.getSnapshot('black');
    expect(black.fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/8/8');
    expect(black.historySan).toEqual(['?']);
    expect(black.dests!.e7).toEqual(expect.arrayContaining(['e6', 'e5']));
    expect(black.visible).toContain('e5');
    expect(black.visible).not.toContain('e4');
  });

  it('fog: spectators see nothing until the game ends, then everyone sees everything', () => {
    const room = fogRoom();
    room.move('white', { from: 'e2', to: 'e4' });
    const spectator = room.getSnapshot('spectator');
    expect(spectator.fen.split(' ')[0]).toBe('8/8/8/8/8/8/8/8');
    expect(spectator.historySan).toEqual(['?']);
    expect(spectator.visible).toEqual([]);
    room.resign('black');
    const after = room.getSnapshot('spectator');
    expect(after.fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(after.historySan).toEqual(['e2e4']);
    expect(after.visible).toBeNull();
  });

  it('fog: accepts castling dragged as a two-square king move and records it king-to-rook', () => {
    const room = fogRoom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(room.move('white', { from: 'e1', to: 'g1' }).ok).toBe(true);
    expect(room.getSnapshot('white').historySan).toEqual(['e1h1']);
    expect(room.getSnapshot('white').fen.split(' ')[0].split('/')[7]).toBe('R4RK1');
  });

  it('fog: undo rebuilds the position from the recorded moves', () => {
    const room = fogRoom();
    room.move('white', { from: 'e2', to: 'e4' });
    room.offerUndo('white');
    room.respondUndo('black', true);
    expect(room.getSnapshot('white').fen.split(' ')[0]).toBe('8/8/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(room.getSnapshot('white').historySan).toEqual([]);
  });

  it('gives non-fog snapshots no fog fields', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot('white');
    expect(snapshot.fog).toBe(false);
    expect(snapshot.visible).toBeNull();
    expect(snapshot.dests).toBeNull();
  });

  function finishedGame(startFen?: string) {
    let now = 1_000_000;
    const room = new Room('r1', 60_000, 'white', () => now, startFen);
    const whiteWs = fakeWs();
    const blackWs = fakeWs();
    const white = room.connect(whiteWs);
    room.connect(blackWs);
    room.resign('white');
    return { room, whiteWs, blackWs, whiteToken: white.token!, tick: (ms: number) => (now += ms) };
  }

  it('rematch: accepting starts a fresh game in the same room with colours swapped', () => {
    const { room, whiteWs, blackWs, whiteToken } = finishedGame();
    const firstGameId = room.gameId;
    room.markPersisted();
    expect(room.offerRematch('black').ok).toBe(true);
    expect(room.getSnapshot('white').rematchOfferBy).toBe('black');
    expect(room.respondRematch('white', true).ok).toBe(true);

    expect(room.status).toBe('playing');
    expect(room.result).toBeNull();
    expect(room.gameId).not.toBe(firstGameId);
    expect(room.isPersisted()).toBe(false);
    expect(room.seatColorFor(whiteWs)).toBe('black');
    expect(room.seatColorFor(blackWs)).toBe('white');
    const snapshot = room.getSnapshot('white');
    expect(snapshot.historySan).toEqual([]);
    expect(snapshot.clocks).toEqual({ white: 60_000, black: 60_000 });
    expect(snapshot.rematchOfferBy).toBeNull();
    // The first game's white player keeps their token, which now means black.
    expect(room.connect(fakeWs(), whiteToken).seat).toBe('black');
  });

  it('rematch: both players asking starts it without an explicit accept', () => {
    const { room } = finishedGame();
    room.offerRematch('white');
    expect(room.offerRematch('black').ok).toBe(true);
    expect(room.status).toBe('playing');
  });

  it('rematch: declining keeps the finished game and clears the offer', () => {
    const { room } = finishedGame();
    room.offerRematch('white');
    expect(room.respondRematch('black', false).ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.rematchOfferBy).toBeNull();
  });

  it('rematch: only players can ask, only once the game is over, and not answer themselves', () => {
    const live = new Room('r1', 0, 'white');
    live.connect(fakeWs());
    live.connect(fakeWs());
    expect(live.offerRematch('white')).toEqual({ ok: false, error: 'game is not finished' });

    const { room } = finishedGame();
    expect(room.offerRematch('spectator').ok).toBe(false);
    room.offerRematch('white');
    expect(room.respondRematch('white', true)).toEqual({ ok: false, error: 'no pending rematch offer for you' });
  });

  it('rematch: reuses a custom starting position', () => {
    const startFen = '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1';
    const { room } = finishedGame(startFen);
    room.offerRematch('white');
    room.respondRematch('black', true);
    expect(room.getSnapshot().startFen).toBe(startFen);
  });

  it('tells each viewer which seat the snapshot is for', () => {
    const room = new Room('r1', 0, 'white');
    expect(room.getSnapshot('black').seat).toBe('black');
    expect(room.getSnapshot().seat).toBe('spectator');
  });
});
