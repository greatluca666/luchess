// client/src/games.ts
import { Chessground } from 'chessground';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { extractSanMoves } from './pgnReplay.js';

const listEl = document.getElementById('games-list')!;
const boardEl = document.getElementById('replay-board')!;
const prevBtn = document.getElementById('replay-prev') as HTMLButtonElement;
const nextBtn = document.getElementById('replay-next') as HTMLButtonElement;

const ground = Chessground(boardEl, { viewOnly: true });

let replayMoves: string[] = [];
let replayIndex = 0;

async function loadList(): Promise<void> {
  const res = await fetch('/api/games');
  const games = await res.json();
  listEl.innerHTML = games
    .map((g: any) => `<li><a href="#" data-id="${g.id}">${g.id} — ${g.result} (${g.resultReason})</a></li>`)
    .join('');
  listEl.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      loadReplay((a as HTMLAnchorElement).dataset.id!);
    })
  );
}

async function loadReplay(id: string): Promise<void> {
  const res = await fetch(`/api/games/${id}`);
  const game = await res.json();
  replayMoves = extractSanMoves(game.pgn);
  replayIndex = 0;
  render();
}

function positionAt(index: number): Chess {
  const pos = Chess.default();
  for (let i = 0; i < index; i++) {
    const move = parseSan(pos, replayMoves[i]);
    if (!move) break;
    pos.play(move);
  }
  return pos;
}

function render(): void {
  const pos = positionAt(replayIndex);
  ground.set({ fen: makeFen(pos.toSetup()) });
}

prevBtn.addEventListener('click', () => {
  if (replayIndex === 0) return;
  replayIndex -= 1;
  render();
});

nextBtn.addEventListener('click', () => {
  if (replayIndex >= replayMoves.length) return;
  replayIndex += 1;
  render();
});

loadList();
