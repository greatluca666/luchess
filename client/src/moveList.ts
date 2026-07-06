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
