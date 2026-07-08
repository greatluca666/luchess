// Mirrors server/src/chess960.ts — same Fischer Random back-rank shuffle,
// duplicated here because the client and server are separate packages with
// no shared-code mechanism between them. Used purely for the home page's
// decorative preview board (the real per-game randomization happens
// server-side); if the two ever need to share a seed, that's the day to add
// a shared package.
type BackRankRole = 'king' | 'queen' | 'rook' | 'bishop' | 'knight';

const ROLE_LETTER: Record<BackRankRole, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
};

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function pickAndRemove(pool: number[]): number {
  const index = randomIndex(pool.length);
  const [value] = pool.splice(index, 1);
  return value;
}

function generateBackRank(): BackRankRole[] {
  const files: (BackRankRole | null)[] = new Array(8).fill(null);

  const darkFiles = [0, 2, 4, 6];
  const lightFiles = [1, 3, 5, 7];
  files[pickAndRemove(darkFiles)] = 'bishop';
  files[pickAndRemove(lightFiles)] = 'bishop';

  const emptyFiles = () => files.reduce<number[]>((acc, f, i) => (f === null ? [...acc, i] : acc), []);

  files[pickAndRemove(emptyFiles())] = 'queen';
  files[pickAndRemove(emptyFiles())] = 'knight';
  files[pickAndRemove(emptyFiles())] = 'knight';

  const remaining = emptyFiles().sort((a, b) => a - b);
  files[remaining[0]] = 'rook';
  files[remaining[1]] = 'king';
  files[remaining[2]] = 'rook';

  return files as BackRankRole[];
}

export function generateChess960Fen(): string {
  const backRank = generateBackRank();
  const whiteRank = backRank.map((role) => ROLE_LETTER[role]).join('');
  const blackRank = whiteRank.toLowerCase();
  return `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w KQkq - 0 1`;
}
