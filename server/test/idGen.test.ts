import { describe, it, expect } from 'vitest';
import { generateRoomId, generateToken } from '../src/idGen.js';

describe('idGen', () => {
  it('generates a room id of the requested length using the safe alphabet', () => {
    const id = generateRoomId(8);
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it('generates different ids across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateRoomId(8)));
    expect(ids.size).toBe(200);
  });

  it('generates a token longer than the default room id', () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThan(8);
  });
});
