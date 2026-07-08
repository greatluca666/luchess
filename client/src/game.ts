// client/src/game.ts
import { Chessground } from 'chessground';
import type { Key, Dests } from 'chessground/types';
import type { Position } from 'chessops/chess';
import { defaultPosition, setupPosition } from 'chessops/variant';
import { parseFen, makeFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { WsClient } from './wsClient.js';
import { formatClock } from './clock.js';
import { shouldShowInvitePanel } from './invitePanel.js';
import { computeCapturedPieces, type Role } from './capturedPieces.js';
import { buildMoveRows } from './moveList.js';

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

let mySeat: 'white' | 'black' | 'spectator' = 'spectator';
let localChess: Position = defaultPosition('chess');

const ground = Chessground(boardEl, {
  movable: { free: false, color: undefined },
  events: { move: (orig: Key, dest: Key) => sendMove(orig, dest) },
});

const ws = new WsClient({
  roomId,
  onMessage: (msg) => {
    if (msg.type === 'joined') {
      mySeat = msg.seat;
    } else if (msg.type === 'state') {
      applyState(msg);
    } else if (msg.type === 'error') {
      console.warn('server error:', msg.message);
    }
  },
});

function sendMove(from: string, to: string): void {
  ws.send({ type: 'move', from, to, promotion: 'q' });
}

function computeDests(pos: Position): Dests {
  return chessgroundDests(pos) as Dests;
}

function pieceIconHtml(color: 'white' | 'black', role: Role): string {
  return `<span class="piece-icon ${color} ${role}"></span>`;
}

function variantLabel(state: any): string {
  if (state.chess960) return 'Chess960';
  if (state.variant === '3check') return '三check';
  if (state.variant === 'kingofthehill') return 'King of the Hill';
  if (state.variant === 'atomic') return 'Atomic';
  if (state.variant === 'antichess') return 'Antichess';
  if (state.variant === 'racingkings') return 'Racing Kings';
  if (state.variant === 'horde') return 'Horde';
  return '标准';
}

function renderCaptured(state: any): void {
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
  localChess = setupPosition(state.variant, parseFen(state.fen).unwrap()).unwrap();
  const turnColor = state.turn === 'white' ? 'white' : 'black';

  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: mySeat === 'white' || mySeat === 'black' ? mySeat : undefined,
      dests: mySeat === turnColor ? computeDests(localChess) : new Map(),
    },
    check: localChess.isCheck(),
  });
  // Queuing a move while it's not your turn (chessground calls this a
  // "premove") only stores it in premovable.current — the host app must
  // explicitly ask chessground to play it once dests are updated for the
  // new turn, or it just sits there forever.
  ground.playPremove();

  clockTop.textContent = formatClock(mySeat === 'black' ? state.clocks.white : state.clocks.black);
  clockBottom.textContent = formatClock(mySeat === 'black' ? state.clocks.black : state.clocks.white);

  variantLabelEl.textContent = variantLabel(state);
  renderCaptured(state);

  moveListEl.innerHTML = buildMoveRows(state.historySan)
    .map((row) => `<li><span class="move-num">${row.num}.</span><span>${row.white}</span><span>${row.black}</span></li>`)
    .join('');

  renderInvitePanel(state);
  renderOfferBanner(state);
  renderControls(state);

  if (state.status === 'finished') {
    offerBanner.hidden = false;
    offerBanner.textContent = `对局结束: ${state.result} (${state.resultReason})`;
  }
}

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
    offerBanner.innerHTML = `对方求和, <button id="accept-draw">同意</button> <button id="reject-draw">拒绝</button>`;
    document.getElementById('accept-draw')!.addEventListener('click', () =>
      ws.send({ type: 'respondDraw', accept: true })
    );
    document.getElementById('reject-draw')!.addEventListener('click', () =>
      ws.send({ type: 'respondDraw', accept: false })
    );
  } else if (state.undoOfferBy && state.undoOfferBy !== mySeat) {
    offerBanner.hidden = false;
    offerBanner.innerHTML = `对方请求悔棋, <button id="accept-undo">同意</button> <button id="reject-undo">拒绝</button>`;
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
  const original = copyInviteBtn.textContent;
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
  copyInviteBtn.textContent = copied ? '已复制!' : '已选中, 按 Ctrl+C 复制';
  setTimeout(() => {
    copyInviteBtn.textContent = original;
  }, 2000);
});
