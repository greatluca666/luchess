export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// An unlimited game (timeControlMs 0) has no clock at all — the server never
// counts it down, so the 0 it reports doesn't mean "out of time".
export function clockText(ms: number, timeControlMs: number): string {
  return timeControlMs === 0 ? '∞' : formatClock(ms);
}
