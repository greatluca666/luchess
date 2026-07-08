const MIN_CUSTOM_MINUTES = 1;
const MAX_CUSTOM_MINUTES = 180;

export function resolveTimeControlMs(selectValue: string, customMinutesValue: string): number {
  if (selectValue !== 'custom') return Number(selectValue);
  const minutes = Math.round(Number(customMinutesValue));
  const clamped = Math.min(MAX_CUSTOM_MINUTES, Math.max(MIN_CUSTOM_MINUTES, Number.isFinite(minutes) ? minutes : MIN_CUSTOM_MINUTES));
  return clamped * 60_000;
}
