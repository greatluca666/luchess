export function extractSanMoves(pgn: string): string[] {
  return pgn
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !/^\d+\.+$/.test(token))
    .filter((token) => !['*', '1-0', '0-1', '1/2-1/2'].includes(token));
}
