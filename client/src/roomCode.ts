// client/src/roomCode.ts
// Accepts what people actually type or paste into "join a room": the six
// digits (spaces allowed) or a whole invite link.
export function normalizeRoomCode(input: string): string | null {
  const fromLink = input.match(/\/game\/(\d+)/);
  if (fromLink) return /^\d{6}$/.test(fromLink[1]) ? fromLink[1] : null;
  const digits = input.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}
