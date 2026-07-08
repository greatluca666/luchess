import { describe, it, expect } from 'vitest';
import { resolveTimeControlMs } from '../src/timeControl.js';

describe('resolveTimeControlMs', () => {
  it('passes preset values straight through as ms', () => {
    expect(resolveTimeControlMs('0', '20')).toBe(0);
    expect(resolveTimeControlMs('300000', '20')).toBe(300000);
  });

  it('converts custom minutes to ms', () => {
    expect(resolveTimeControlMs('custom', '20')).toBe(20 * 60_000);
    expect(resolveTimeControlMs('custom', '1')).toBe(60_000);
  });

  it('clamps custom minutes to the 1-180 range', () => {
    expect(resolveTimeControlMs('custom', '0')).toBe(1 * 60_000);
    expect(resolveTimeControlMs('custom', '-5')).toBe(1 * 60_000);
    expect(resolveTimeControlMs('custom', '999')).toBe(180 * 60_000);
  });

  it('falls back to the minimum for garbage input', () => {
    expect(resolveTimeControlMs('custom', 'abc')).toBe(1 * 60_000);
    expect(resolveTimeControlMs('custom', '')).toBe(1 * 60_000);
  });

  it('rounds fractional minutes', () => {
    expect(resolveTimeControlMs('custom', '5.6')).toBe(6 * 60_000);
  });
});
