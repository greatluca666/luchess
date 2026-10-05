import { describe, it, expect } from 'vitest';
import { formatClock, clockText } from '../src/clock.js';

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

describe('clockText', () => {
  it('shows infinity for an unlimited game instead of an empty clock', () => {
    expect(clockText(0, 0)).toBe('∞');
  });

  it('formats the remaining time for a timed game', () => {
    expect(clockText(65_000, 600_000)).toBe('1:05');
    expect(clockText(0, 600_000)).toBe('0:00');
  });
});
