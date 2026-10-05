export interface MoveRow {
  num: number;
  white: string;
  black: string;
}

export function buildMoveRows(historySan: string[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 0; i < historySan.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      white: historySan[i] ?? '',
      black: historySan[i + 1] ?? '',
    });
  }
  return rows;
}

// Fog of War history is UCI ("e2e4", "e7e8q") or "?" for an opponent move
// the viewer isn't allowed to see.
export function formatFogMove(token: string): string {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) return token;
  const promotion = token.length === 5 ? `=${token[4].toUpperCase()}` : '';
  return `${token.slice(0, 2)}-${token.slice(2, 4)}${promotion}`;
}
