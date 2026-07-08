// client/src/games.ts
import { Chessground } from 'chessground';
import type { Position } from 'chessops/chess';
import { setupPosition } from 'chessops/variant';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { extractSanMoves } from './pgnReplay.js';
import { rulesFor } from './variantRules.js';

const listEl = document.getElementById('games-list')!;
const boardEl = document.getElementById('replay-board')!;
const prevBtn = document.getElementById('replay-prev') as HTMLButtonElement;
const nextBtn = document.getElementById('replay-next') as HTMLButtonElement;

const ground = Chessground(boardEl, { viewOnly: true });

let replayMoves: string[] = [];
let replayStartFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let replayVariant = 'chess';
let replayIndex = 0;

const VARIANT_LABELS: Record<string, string> = {
  chess: '标准',
  chess960: 'Chess960',
  '3check': '三check',
  kingofthehill: 'King of the Hill',
  atomic: 'Atomic',
  antichess: 'Antichess',
  racingkings: 'Racing Kings',
  horde: 'Horde',
};

async function loadList(): Promise<void> {
  const res = await fetch('/api/games');
  const games = await res.json();
  listEl.innerHTML = games
    .map(
      (g: any) =>
        `<li><a href="#" data-id="${g.id}">${g.id} — ${VARIANT_LABELS[g.variant] ?? g.variant} — ${g.result} (${g.resultReason})</a></li>`
    )
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
  replayStartFen = game.startFen;
  replayVariant = game.variant;
  replayIndex = 0;
  render();
}

function positionAt(index: number): Position {
  const pos = setupPosition(rulesFor(replayVariant), parseFen(replayStartFen).unwrap()).unwrap();
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
