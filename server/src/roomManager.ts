import { Room, type Color } from './room.js';
import { generateRoomCode } from './idGen.js';
import type { Rules } from 'chessops/types';

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_AFTER_MS = 10 * 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private emptySince = new Map<string, number>();

  createRoom(
    timeControlMs: number,
    colorPref: Color | 'random',
    rules: Rules = 'chess',
    startFen?: string,
    chess960: boolean = false,
    incrementMs: number = 0,
    fog: boolean = false
  ): Room {
    let id = generateRoomCode();
    while (this.rooms.has(id)) id = generateRoomCode();
    const room = new Room(id, timeControlMs, colorPref, Date.now, startFen, rules, chess960, incrementMs, fog);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  allRooms(): IterableIterator<Room> {
    return this.rooms.values();
  }

  startCleanupLoop(): NodeJS.Timeout {
    return setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS);
  }

  sweep(now: number = Date.now()): void {
    for (const [id, room] of this.rooms) {
      if (room.hasActiveConnections()) {
        this.emptySince.delete(id);
        continue;
      }
      const since = this.emptySince.get(id);
      if (since === undefined) {
        this.emptySince.set(id, now);
      } else if (now - since >= CLEANUP_AFTER_MS) {
        this.rooms.delete(id);
        this.emptySince.delete(id);
      }
    }
  }
}
