import { describe, it, expect } from 'vitest';
import { generateGameId, generateRoomCode, generateToken } from '../src/idGen.js';

describe('idGen', () => {
  it('generates six-digit room codes that never start with 0', () => {
    for (let i = 0; i < 200; i++) expect(generateRoomCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it('generates a game id of the requested length using the safe alphabet', () => {
    const id = generateGameId(8);
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it('generates different game ids across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateGameId(8)));
    expect(ids.size).toBe(200);
  });

  it('generates a token longer than a game id', () => {
    expect(generateToken().length).toBeGreaterThan(8);
  });
});
