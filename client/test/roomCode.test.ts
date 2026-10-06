import { describe, it, expect } from 'vitest';
import { normalizeRoomCode } from '../src/roomCode.js';

describe('normalizeRoomCode', () => {
  it('accepts six digits, with or without spaces', () => {
    expect(normalizeRoomCode('482913')).toBe('482913');
    expect(normalizeRoomCode(' 482 913 ')).toBe('482913');
  });

  it('pulls the code out of a pasted invite link', () => {
    expect(normalizeRoomCode('https://luchess.cc.cd/game/482913')).toBe('482913');
  });

  it('rejects anything that is not exactly six digits', () => {
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('48291')).toBeNull();
    expect(normalizeRoomCode('4829134')).toBeNull();
    expect(normalizeRoomCode('abcdef')).toBeNull();
    expect(normalizeRoomCode('https://luchess.cc.cd/game/4829134')).toBeNull();
  });
});
