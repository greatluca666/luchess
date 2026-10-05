// client/src/game.ts
import { Chessground } from 'chessground';
import { setDropMode, cancelDropMode } from 'chessground/drop';
import type { Key, Dests, MouchEvent, Piece } from 'chessground/types';
import type { Position } from 'chessops/chess';
import { defaultPosition, setupPosition } from 'chessops/variant';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { makeSquare } from 'chessops/util';
import { chessgroundDests } from 'chessops/compat';
import { WsClient } from './wsClient.js';
import { formatClock } from './clock.js';
import { shouldShowInvitePanel } from './invitePanel.js';
import { computeCapturedPieces, type Role } from './capturedPieces.js';
import { buildMoveRows, formatFogMove } from './moveList.js';
import { explodedSquares } from './atomicExplosion.js';
import { t, variantLabel, resultText, errorText } from './i18n.js';
import { initPageI18n } from './pageI18n.js';
import { parsePockets, dropDestKeys, DROP_ROLES, type DropRole, type PocketCounts } from './pockets.js';

const KOTH_CENTER_SQUARES: Key[] = ['d4', 'd5', 'e4', 'e5'];
const ALL_KEYS: Key[] = [...'abcdefgh'].flatMap((file) => [...'12345678'].map((rank) => `${file}${rank}` as Key));

const roomId = location.pathname.split('/').pop()!;
const boardEl = document.getElementById('board')!;
const clockTop = document.getElementById('clock-top')!;
const clockBottom = document.getElementById('clock-bottom')!;
const moveListEl = document.getElementById('move-list')!;
const offerBanner = document.getElementById('offer-banner')!;
const resignBtn = document.getElementById('resign-btn') as HTMLButtonElement;
const drawBtn = document.getElementById('draw-btn') as HTMLButtonElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
const invitePanel = document.getElementById('invite-panel')!;
const inviteLinkInput = document.getElementById('invite-link') as HTMLInputElement;
const copyInviteBtn = document.getElementById('copy-invite-btn') as HTMLButtonElement;
const variantLabelEl = document.getElementById('variant-label')!;
const capturedTop = document.getElementById('captured-top')!;
const capturedBottom = document.getElementById('captured-bottom')!;
const errorMsgEl = document.getElementById('error-msg')!;

let mySeat: 'white' | 'black' | 'spectator' = 'spectator';
let localChess: Position = defaultPosition('chess');
// Tracks the position/move-count from the previous applyState() call so an
// atomic explosion can be detected by diffing against it — null until the
// first state arrives, so a mid-game join never retroactively "explodes"
// the moves that already happened.
let previousPosition: Position | null = null;
let previousMoveCount = 0;
// Most recent server state, kept so a language switch can redraw all the
// JS-built text without waiting for the next broadcast.
let lastState: any = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;
// Crazyhouse: the pocket piece currently picked up (click-to-drop mode).
let selectedDrop: DropRole | null = null;

const ground = Chessground(boardEl, {
  movable: { free: false, color: undefined },
  events: {
    move: (orig: Key, dest: Key) => sendMove(orig, dest),
    dropNewPiece: (piece: Piece, key: Key) => sendDrop(piece.role as DropRole, key),
  },
});

const ws = new WsClient({
  roomId,
  onMessage: (msg) => {
    if (msg.type === 'joined') {
      mySeat = msg.seat;
    } else if (msg.type === 'state') {
      applyState(msg);
    } else if (msg.type === 'error') {
      showError(msg.message);
    }
  },
});

function showError(message: string): void {
  errorMsgEl.textContent = errorText(message);
  errorMsgEl.hidden = false;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorMsgEl.hidden = true;
  }, 3000);
}

function sendMove(from: string, to: string): void {
  ws.send({ type: 'move', from, to, promotion: 'q' });
}

function sendDrop(role: DropRole, key: Key): void {
  ws.send({ type: 'move', drop: role, to: key });
}

function isPlayer(): boolean {
  return mySeat === 'white' || mySeat === 'black';
}

function dropHighlights(): Map<Key, string> {
  const custom = new Map<Key, string>();
  if (selectedDrop) {
    for (const key of dropDestKeys(localChess, selectedDrop)) custom.set(key as Key, 'drop-dest');
  }
  return custom;
}

function computeDests(pos: Position): Dests {
  return chessgroundDests(pos) as Dests;
}

function pieceIconHtml(color: 'white' | 'black', role: Role): string {
  return `<span class="piece-icon ${color} ${role}"></span>`;
}

// Snapshot variant id as the history page and i18n keys know it: chess960
// and fog of war are flags on top of plain 'chess' rules, not rules values.
function variantId(state: any): string {
  return state.fog ? 'fogofwar' : state.chess960 ? 'chess960' : state.variant;
}

function renderCaptured(state: any): void {
  if (state.variant === 'crazyhouse') {
    renderPockets(state);
    return;
  }
  // Material counted from a masked board would show every hidden enemy piece
  // as captured; reveal captures only once the game is over.
  if (state.fog && state.status !== 'finished') {
    capturedTop.innerHTML = '';
    capturedBottom.innerHTML = '';
    return;
  }
  const { capturedByWhite, capturedByBlack } = computeCapturedPieces(state.fen, state.startFen);
  // capturedByWhite lists the (black) pieces white has captured, so it's
  // rendered with black's icons — and vice versa for capturedByBlack.
  const whiteIcons = capturedByWhite.map((role) => pieceIconHtml('black', role)).join('');
  const blackIcons = capturedByBlack.map((role) => pieceIconHtml('white', role)).join('');

  let whiteChecks = '';
  let blackChecks = '';
  if (state.checksRemaining) {
    whiteChecks = pieceIconHtml('white', 'king').repeat(3 - state.checksRemaining.white);
    blackChecks = pieceIconHtml('black', 'king').repeat(3 - state.checksRemaining.black);
  }

  const iAmBlack = mySeat === 'black';
  capturedTop.innerHTML = iAmBlack ? whiteIcons + whiteChecks : blackIcons + blackChecks;
  capturedBottom.innerHTML = iAmBlack ? blackIcons + blackChecks : whiteIcons + whiteChecks;
}

function applyState(state: any): void {
  lastState = state;
  const prevPosition = previousPosition;
  const prevMoveCount = previousMoveCount;
  const turnColor = state.turn === 'white' ? 'white' : 'black';
  // The server re-broadcasts every second for the clocks, so only a real
  // change (a move, or the turn passing) drops a picked-up pocket piece.
  if (state.historySan.length !== prevMoveCount || mySeat !== turnColor || state.status !== 'playing') {
    selectedDrop = null;
  }

  if (state.fog) {
    // A masked fog position may lack the opponent's king, which chessops'
    // setupPosition() rejects — so fog games skip chessops entirely and use
    // the server's dests.
    applyFogBoard(state, turnColor);
    previousPosition = null;
  } else {
    localChess = setupPosition(state.variant, parseFen(state.fen).unwrap()).unwrap();
    applyStandardBoard(state, turnColor);
    flashAtomicExplosion(state, prevPosition, prevMoveCount);
    previousPosition = localChess;
  }
  previousMoveCount = state.historySan.length;

  clockTop.textContent = formatClock(mySeat === 'black' ? state.clocks.white : state.clocks.black);
  clockBottom.textContent = formatClock(mySeat === 'black' ? state.clocks.black : state.clocks.white);

  variantLabelEl.textContent = variantLabel(variantId(state));
  renderCaptured(state);

  const moves: string[] = state.fog ? state.historySan.map(formatFogMove) : state.historySan;
  moveListEl.innerHTML = buildMoveRows(moves)
    .map((row) => `<li><span class="move-num">${row.num}.</span><span>${row.white}</span><span>${row.black}</span></li>`)
    .join('');

  renderInvitePanel(state);
  renderOfferBanner(state);
  renderControls(state);

  if (state.status === 'finished') {
    offerBanner.hidden = false;
    offerBanner.textContent = `${t('game.gameOver')}: ${resultText(state.result, state.resultReason)}`;
  }
}

function applyStandardBoard(state: any, turnColor: 'white' | 'black'): void {
  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: isPlayer() ? (mySeat as 'white' | 'black') : undefined,
      dests: mySeat === turnColor ? computeDests(localChess) : new Map(),
    },
    premovable: { enabled: true },
    check: localChess.isCheck(),
    highlight: { custom: dropHighlights() },
    drawable: {
      // King of the Hill: highlight the four center squares so players can
      // see at a glance where they need to march their king.
      autoShapes:
        state.variant === 'kingofthehill' ? KOTH_CENTER_SQUARES.map((orig) => ({ orig, brush: 'green' })) : [],
    },
  });
  // Queuing a move while it's not your turn (chessground calls this a
  // "premove") only stores it in premovable.current — the host app must
  // explicitly ask chessground to play it once dests are updated for the
  // new turn, or it just sits there forever.
  ground.playPremove();
  syncDropMode();
}

function applyFogBoard(state: any, turnColor: 'white' | 'black'): void {
  const fogged = new Map<Key, string>();
  if (state.status !== 'finished') {
    const visible = new Set<string>(state.visible ?? []);
    for (const key of ALL_KEYS) if (!visible.has(key)) fogged.set(key, 'fog');
  }
  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: isPlayer() ? (mySeat as 'white' | 'black') : undefined,
      dests: mySeat === turnColor ? (new Map(Object.entries(state.dests ?? {})) as Dests) : new Map(),
    },
    // A premove would need dests for a position the player can't see.
    premovable: { enabled: false },
    check: false,
    highlight: { custom: fogged },
    drawable: { autoShapes: [] },
  });
  syncDropMode();
}

// chessground's dropmode (tap a square to place the picked-up piece) has no
// Config field, only these state helpers. setDropMode() also cancels any
// drag in progress, so it's only called when the selection actually changes
// — never on the once-a-second clock broadcasts.
function syncDropMode(): void {
  const current = ground.state.dropmode;
  if (selectedDrop && isPlayer()) {
    if (!current.active || current.piece?.role !== selectedDrop) {
      setDropMode(ground.state, { color: mySeat as 'white' | 'black', role: selectedDrop });
    }
  } else if (current.active) {
    cancelDropMode(ground.state);
  }
}

// Atomic: flash an explosion effect over whichever squares just lost a
// piece — the capturing piece and everything non-pawn in the blast
// radius — by diffing the position against the one before this move.
function flashAtomicExplosion(state: any, prevPosition: Position | null, prevMoveCount: number): void {
  if (state.variant !== 'atomic' || !prevPosition || state.historySan.length <= prevMoveCount) return;
  const lastSan = state.historySan[state.historySan.length - 1];
  const move = parseSan(prevPosition, lastSan);
  if (move && isNormal(move)) {
    const keys = explodedSquares(
      makeFen(prevPosition.toSetup()).split(' ')[0],
      state.fen.split(' ')[0],
      makeSquare(move.from)
    );
    if (keys.length > 0) ground.explode(keys as Key[]);
  }
}

function renderPockets(state: any): void {
  const pockets = parsePockets(state.fen);
  const bottomColor = mySeat === 'black' ? 'black' : 'white';
  const topColor = bottomColor === 'white' ? 'black' : 'white';
  const canDrop = mySeat === bottomColor && state.status === 'playing' && state.turn === mySeat;
  capturedTop.innerHTML = pocketHtml(topColor, pockets[topColor], false);
  capturedBottom.innerHTML = pocketHtml(bottomColor, pockets[bottomColor], canDrop);
}

function pocketHtml(color: 'white' | 'black', counts: PocketCounts, interactive: boolean): string {
  return DROP_ROLES.map((role) => {
    const count = counts[role];
    const classes = ['pocket-piece'];
    if (count === 0) classes.push('empty');
    if (interactive && selectedDrop === role) classes.push('selected');
    const inner = `${pieceIconHtml(color, role)}<span class="pocket-count">${count}</span>`;
    return interactive && count > 0
      ? `<button type="button" class="${classes.join(' ')}" data-role="${role}">${inner}</button>`
      : `<span class="${classes.join(' ')}">${inner}</span>`;
  }).join('');
}

// A press both picks the piece up (so a later tap on a square drops it, via
// chessground's dropmode) and starts a drag (so it can be dragged straight
// onto the board). Pressing the picked-up piece again puts it back.
function onPocketPress(e: MouseEvent | TouchEvent): void {
  if (e instanceof MouseEvent && e.button !== 0) return;
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.pocket-piece');
  if (!btn || !lastState || !isPlayer()) return;
  e.preventDefault();
  const role = btn.dataset.role as DropRole;
  if (selectedDrop === role) {
    selectedDrop = null;
    applyState(lastState);
    return;
  }
  selectedDrop = role;
  applyState(lastState);
  ground.dragNewPiece({ color: mySeat as 'white' | 'black', role }, e as unknown as MouchEvent);
}

capturedBottom.addEventListener('mousedown', onPocketPress);
capturedBottom.addEventListener('touchstart', onPocketPress, { passive: false });

function renderInvitePanel(state: any): void {
  if (shouldShowInvitePanel(state.status)) {
    invitePanel.hidden = false;
    inviteLinkInput.value = location.href;
  } else {
    invitePanel.hidden = true;
  }
}

function renderOfferBanner(state: any): void {
  if (state.status !== 'playing') return;
  if (state.drawOfferBy && state.drawOfferBy !== mySeat) {
    offerBanner.hidden = false;
    offerBanner.innerHTML = `${t('game.opponentOffersDraw')}, <button id="accept-draw">${t('game.accept')}</button> <button id="reject-draw">${t('game.reject')}</button>`;
    document.getElementById('accept-draw')!.addEventListener('click', () =>
      ws.send({ type: 'respondDraw', accept: true })
    );
    document.getElementById('reject-draw')!.addEventListener('click', () =>
      ws.send({ type: 'respondDraw', accept: false })
    );
  } else if (state.undoOfferBy && state.undoOfferBy !== mySeat) {
    offerBanner.hidden = false;
    offerBanner.innerHTML = `${t('game.opponentRequestsUndo')}, <button id="accept-undo">${t('game.accept')}</button> <button id="reject-undo">${t('game.reject')}</button>`;
    document.getElementById('accept-undo')!.addEventListener('click', () =>
      ws.send({ type: 'respondUndo', accept: true })
    );
    document.getElementById('reject-undo')!.addEventListener('click', () =>
      ws.send({ type: 'respondUndo', accept: false })
    );
  } else {
    offerBanner.hidden = true;
  }
}

function renderControls(state: any): void {
  const isPlayer = mySeat === 'white' || mySeat === 'black';
  const canAct = isPlayer && state.status === 'playing';
  resignBtn.disabled = !canAct;
  drawBtn.disabled = !canAct || state.drawOfferBy === mySeat;
  undoBtn.disabled = !canAct || state.undoOfferBy === mySeat || state.historySan.length === 0;
}

resignBtn.addEventListener('click', () => ws.send({ type: 'resign' }));
drawBtn.addEventListener('click', () => ws.send({ type: 'offerDraw' }));
undoBtn.addEventListener('click', () => ws.send({ type: 'offerUndo' }));

copyInviteBtn.addEventListener('click', async () => {
  const link = location.href;
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    // navigator.clipboard requires a secure context (https or localhost) and
    // is unavailable over plain http on a bare IP — fall back to the older
    // execCommand API, which still works there.
    inviteLinkInput.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  copyInviteBtn.textContent = copied ? t('game.copied') : t('game.copiedFallback');
  setTimeout(() => {
    copyInviteBtn.textContent = t('game.copyInvite');
  }, 2000);
});

initPageI18n(() => {
  if (lastState) applyState(lastState);
});
