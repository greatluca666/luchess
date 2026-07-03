// client/src/game.ts
import { Chessground } from 'chessground';
import type { Key, Dests } from 'chessground/types';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { WsClient } from './wsClient.js';
import { formatClock } from './clock.js';
import { shouldShowInvitePanel } from './invitePanel.js';

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

let mySeat: 'white' | 'black' | 'spectator' = 'spectator';
let localChess: Chess = Chess.default();

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

function computeDests(pos: Chess): Dests {
  return chessgroundDests(pos) as Dests;
}

function applyState(state: any): void {
  localChess = Chess.fromSetup(parseFen(state.fen).unwrap()).unwrap();
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

  clockTop.textContent = formatClock(mySeat === 'black' ? state.clocks.white : state.clocks.black);
  clockBottom.textContent = formatClock(mySeat === 'black' ? state.clocks.black : state.clocks.white);

  moveListEl.innerHTML = state.historySan
    .map((san: string, i: number) => `<li>${i % 2 === 0 ? `${i / 2 + 1}.` : ''} ${san}</li>`)
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
  try {
    await navigator.clipboard.writeText(link);
    copyInviteBtn.textContent = '已复制!';
  } catch {
    inviteLinkInput.select();
    copyInviteBtn.textContent = '已选中, 按 Ctrl+C 复制';
  }
  setTimeout(() => {
    copyInviteBtn.textContent = original;
  }, 2000);
});
