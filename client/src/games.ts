// client/src/games.ts
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';

const listEl = document.getElementById('games-list')!;
const boardEl = document.getElementById('replay-board')!;
const prevBtn = document.getElementById('replay-prev') as HTMLButtonElement;
const nextBtn = document.getElementById('replay-next') as HTMLButtonElement;

const ground = Chessground(boardEl, { viewOnly: true });

let replayChess = new Chess();
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
  const parsed = new Chess();
  parsed.loadPgn(game.pgn);
  replayMoves = parsed.history();
  replayChess = new Chess();
  replayIndex = 0;
  render();
}

function render(): void {
  ground.set({ fen: replayChess.fen() });
}

prevBtn.addEventListener('click', () => {
  if (replayIndex === 0) return;
  replayIndex -= 1;
  replayChess = new Chess();
  for (let i = 0; i < replayIndex; i++) replayChess.move(replayMoves[i]);
  render();
});

nextBtn.addEventListener('click', () => {
  if (replayIndex >= replayMoves.length) return;
  replayChess.move(replayMoves[replayIndex]);
  replayIndex += 1;
  render();
});

loadList();
