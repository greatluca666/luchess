const MIN_CUSTOM_MINUTES = 1;
const MAX_CUSTOM_MINUTES = 180;
const MAX_INCREMENT_SECONDS = 60;

export function resolveTimeControlMs(selectValue: string, customMinutesValue: string): number {
  if (selectValue !== 'custom') return Number(selectValue);
  const minutes = Math.round(Number(customMinutesValue));
  const clamped = Math.min(MAX_CUSTOM_MINUTES, Math.max(MIN_CUSTOM_MINUTES, Number.isFinite(minutes) ? minutes : MIN_CUSTOM_MINUTES));
  return clamped * 60_000;
}

// Increment only applies to the custom time control — the presets (5+0,
// 10+0, 15+0) are fixed at 0 increment by design.
export function resolveIncrementMs(selectValue: string, incrementSecondsValue: string): number {
  if (selectValue !== 'custom') return 0;
  const seconds = Math.round(Number(incrementSecondsValue));
  const clamped = Math.min(MAX_INCREMENT_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  return clamped * 1000;
}
