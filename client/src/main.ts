// client/src/main.ts
import { resolveTimeControlMs } from './timeControl.js';

const createBtn = document.getElementById('create-btn') as HTMLButtonElement;
const timeSelect = document.getElementById('time-control') as HTMLSelectElement;
const customTimeWrap = document.getElementById('custom-time-wrap') as HTMLElement;
const customTimeMinutes = document.getElementById('custom-time-minutes') as HTMLInputElement;
const colorSelect = document.getElementById('color-pref') as HTMLSelectElement;
const variantSelect = document.getElementById('variant') as HTMLSelectElement;

timeSelect.addEventListener('change', () => {
  customTimeWrap.hidden = timeSelect.value !== 'custom';
});

// Variant tiles are a shortcut for the #variant select, not a replacement —
// clicking one just sets the select's value so createBtn's handler doesn't
// need to know tiles exist.
const variantTiles = document.querySelectorAll<HTMLButtonElement>('.variant-tile');
variantTiles.forEach((tile) => {
  tile.addEventListener('click', () => {
    variantSelect.value = tile.dataset.value!;
    variantTiles.forEach((t) => t.setAttribute('aria-pressed', String(t === tile)));
  });
});
variantSelect.addEventListener('change', () => {
  variantTiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.value === variantSelect.value)));
});

createBtn.addEventListener('click', async () => {
  const timeControlMs = resolveTimeControlMs(timeSelect.value, customTimeMinutes.value);
  const colorPref = colorSelect.value;
  const variant = variantSelect.value;
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeControlMs, colorPref, variant }),
  });
  const { roomId } = await res.json();
  location.href = `/game/${roomId}`;
});

// Decorative starting-position board on the hero — aria-hidden, non-interactive.
const START_POSITION = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
] as const;

const PIECE_GLYPH: Record<string, string> = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
};

const decoBoard = document.getElementById('deco-board');
if (decoBoard) {
  START_POSITION.forEach((row, r) => {
    row.forEach((cell, c) => {
      const sq = document.createElement('div');
      sq.className = 'deco-sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (cell) {
        const span = document.createElement('span');
        span.className = cell === cell.toUpperCase() ? 'piece-w' : 'piece-b';
        span.textContent = PIECE_GLYPH[cell];
        sq.appendChild(span);
      }
      decoBoard.appendChild(sq);
    });
  });
}
