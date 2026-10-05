import type { Rules } from 'chessops/types';

// chess960 and fogofwar are flags on top of plain chess rules (a shuffled
// start / hidden information), not chessops rules of their own.
const CHESS_RULES_VARIANTS = new Set(['chess960', 'fogofwar']);

export function rulesFor(variant: string): Rules {
  return CHESS_RULES_VARIANTS.has(variant) ? 'chess' : (variant as Rules);
}
