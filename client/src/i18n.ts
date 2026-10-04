export const VARIANT_LABELS: Record<string, string> = {
  chess: 'Standard',
  chess960: 'Chess960',
  '3check': 'Three-check',
  kingofthehill: 'King of the Hill',
  atomic: 'Atomic',
  antichess: 'Antichess',
  racingkings: 'Racing Kings',
  horde: 'Horde',
};

export const GAME_TEXT = {
  waitingForOpponent: 'Waiting for opponent... Share this link with a friend:',
  copyInviteLink: 'Copy invite link',
  resign: 'Resign',
  draw: 'Draw',
  undo: 'Undo',
  gameOver: 'Game over',
  opponentOffersDraw: 'Opponent offers a draw',
  opponentRequestsUndo: 'Opponent requests undo',
  accept: 'Accept',
  reject: 'Reject',
  copied: 'Copied!',
  copiedFallback: 'Selected, press Ctrl+C to copy',
  history: 'Game history',
  previous: 'Previous',
  next: 'Next',
} as const;
