import { randomBytes, randomInt } from 'node:crypto';

// Excludes visually ambiguous characters (0/O, 1/l/I).
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

// Room numbers are what people type or read out to each other: six digits,
// never starting with 0.
export function generateRoomCode(): string {
  return String(randomInt(100000, 1000000));
}

// One per game, for the history database — a room hosts many games.
export function generateGameId(length = 8): string {
  return generateId(length);
}

export function generateToken(length = 24): string {
  return generateId(length);
}

function generateId(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
