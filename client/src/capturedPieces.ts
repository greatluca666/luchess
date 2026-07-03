export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

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

function countPieces(boardPart: string): { white: Record<Role, number>; black: Record<Role, number> } {
  const white = emptyCounts();
  const black = emptyCounts();
  for (const ch of boardPart) {
    const role = FEN_CHAR_TO_ROLE[ch.toLowerCase()];
    if (!role) continue;
    if (ch === ch.toLowerCase()) black[role] += 1;
    else white[role] += 1;
  }
  return { white, black };
}

function missingPieces(starting: Record<Role, number>, present: Record<Role, number>): Role[] {
  const list: Role[] = [];
  for (const role of Object.keys(starting) as Role[]) {
    const missing = Math.max(0, starting[role] - present[role]);
    for (let i = 0; i < missing; i++) list.push(role);
  }
  return list;
}

export function computeCapturedPieces(fen: string, startFen: string): CapturedPieces {
  const current = countPieces(fen.split(' ')[0]);
  const starting = countPieces(startFen.split(' ')[0]);

  return {
    capturedByWhite: missingPieces(starting.black, current.black),
    capturedByBlack: missingPieces(starting.white, current.white),
  };
}
