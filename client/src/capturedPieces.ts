export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

const STARTING_COUNTS: Record<Role, number> = {
  pawn: 8,
  knight: 2,
  bishop: 2,
  rook: 2,
  queen: 1,
  king: 1,
};

const FEN_CHAR_TO_ROLE: Record<string, Role> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export interface CapturedPieces {
  capturedByWhite: Role[];
  capturedByBlack: Role[];
}

function emptyCounts(): Record<Role, number> {
  return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 };
}

function missingPieces(present: Record<Role, number>): Role[] {
  const list: Role[] = [];
  for (const role of Object.keys(STARTING_COUNTS) as Role[]) {
    const missing = STARTING_COUNTS[role] - present[role];
    for (let i = 0; i < missing; i++) list.push(role);
  }
  return list;
}

export function computeCapturedPieces(fen: string): CapturedPieces {
  const boardPart = fen.split(' ')[0];
  const whiteCounts = emptyCounts();
  const blackCounts = emptyCounts();

  for (const ch of boardPart) {
    const role = FEN_CHAR_TO_ROLE[ch.toLowerCase()];
    if (!role) continue;
    if (ch === ch.toLowerCase()) blackCounts[role] += 1;
    else whiteCounts[role] += 1;
  }

  return {
    capturedByWhite: missingPieces(blackCounts),
    capturedByBlack: missingPieces(whiteCounts),
  };
}
