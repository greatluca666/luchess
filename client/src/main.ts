// client/src/main.ts
import { defaultPosition } from 'chessops/variant';
import { makeFen } from 'chessops/fen';
import { resolveTimeControlMs, resolveIncrementMs } from './timeControl.js';
import { rulesFor } from './variantRules.js';
import { boardGridFromFen } from './boardFromFen.js';
import { generateChess960Fen } from './chess960.js';
import { initPageI18n } from './pageI18n.js';

const createBtn = document.getElementById('create-btn') as HTMLButtonElement;
const timeSelect = document.getElementById('time-control') as HTMLSelectElement;
const customTimeWrap = document.getElementById('custom-time-wrap') as HTMLElement;
const customTimeMinutes = document.getElementById('custom-time-minutes') as HTMLInputElement;
const customIncrementSeconds = document.getElementById('custom-increment-seconds') as HTMLInputElement;
const colorSelect = document.getElementById('color-pref') as HTMLSelectElement;
const variantSelect = document.getElementById('variant') as HTMLSelectElement;
const decoBoard = document.getElementById('deco-board');
const variantTiles = document.querySelectorAll<HTMLButtonElement>('.variant-tile');

timeSelect.addEventListener('change', () => {
  customTimeWrap.hidden = timeSelect.value !== 'custom';
});

// Decorative starting-position board on the hero — aria-hidden,
// non-interactive, redrawn for whichever variant is currently selected.
// chess960 gets a fresh random shuffle each time it's picked (the real
// per-game position is randomized server-side the same way — this preview
// just shows what that looks like, not the actual position the game will use).
function renderDecoBoard(variant: string): void {
  if (!decoBoard) return;
  const fen = variant === 'chess960' ? generateChess960Fen() : makeFen(defaultPosition(rulesFor(variant)).toSetup());
  const grid = boardGridFromFen(fen.split(' ')[0]);
  decoBoard.innerHTML = '';
  grid.forEach((row, r) => {
    row.forEach((square, c) => {
      const sq = document.createElement('div');
      sq.className = 'deco-sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (square) {
        const piece = document.createElement('span');
        piece.className = `piece-icon ${square.color} ${square.role}`;
        sq.appendChild(piece);
      }
      decoBoard.appendChild(sq);
    });
  });
}

// Single source of truth for "which variant is selected" — used by both the
// <select> and the variant-tile shortcuts below, so anything that needs to
// react to the choice (the decorative board, tile highlighting) only has to
// hook in here once.
function setVariant(variant: string): void {
  variantSelect.value = variant;
  variantTiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.value === variant)));
  renderDecoBoard(variant);
}

variantTiles.forEach((tile) => {
  tile.addEventListener('click', () => setVariant(tile.dataset.value!));
});
variantSelect.addEventListener('change', () => setVariant(variantSelect.value));

renderDecoBoard(variantSelect.value);

createBtn.addEventListener('click', async () => {
  const timeControlMs = resolveTimeControlMs(timeSelect.value, customTimeMinutes.value);
  const incrementMs = resolveIncrementMs(timeSelect.value, customIncrementSeconds.value);
  const colorPref = colorSelect.value;
  const variant = variantSelect.value;
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeControlMs, incrementMs, colorPref, variant }),
  });
  const { roomId } = await res.json();
  location.href = `/game/${roomId}`;
});

initPageI18n();
