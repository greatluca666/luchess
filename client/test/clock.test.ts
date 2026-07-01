import { describe, it, expect } from 'vitest';
import { formatClock } from '../src/clock.js';

describe('formatClock', () => {
  it('formats whole minutes and seconds', () => {
    expect(formatClock(65_000)).toBe('1:05');
  });

  it('rounds up partial seconds so the clock never shows 0 while time remains', () => {
    expect(formatClock(500)).toBe('0:01');
  });

  it('clamps negative remaining time to zero', () => {
    expect(formatClock(-100)).toBe('0:00');
  });
});
