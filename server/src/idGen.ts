import { randomBytes } from 'node:crypto';

// Excludes visually ambiguous characters (0/O, 1/l/I).
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

export function generateRoomId(length = 8): string {
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
