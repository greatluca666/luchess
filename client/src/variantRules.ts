import type { Rules } from 'chessops/types';

// The persisted/selected variant field uses 'chess960' as its own sentinel
// value, but chessops has no such rules — chess960 is plain 'chess' rules
// with a shuffled starting position.
export function rulesFor(variant: string): Rules {
  return variant === 'chess960' ? 'chess' : (variant as Rules);
}
