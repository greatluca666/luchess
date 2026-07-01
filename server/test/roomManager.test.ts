import { describe, it, expect } from 'vitest';
import type WebSocket from 'ws';
import { RoomManager } from '../src/roomManager.js';

function fakeWs(): WebSocket {
  return { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;
}

describe('RoomManager', () => {
  it('creates rooms with unique ids and can look them up', () => {
    const manager = new RoomManager();
    const a = manager.createRoom(0, 'random');
    const b = manager.createRoom(0, 'random');
    expect(a.id).not.toBe(b.id);
    expect(manager.get(a.id)).toBe(a);
  });

  it('sweeps a room that has had no connections for the cleanup window', () => {
    const manager = new RoomManager();
    const room = manager.createRoom(0, 'random');
    let now = 1_000_000;
    manager.sweep(now);
    expect(manager.get(room.id)).toBeDefined();
    now += 11 * 60_000;
    manager.sweep(now);
    expect(manager.get(room.id)).toBeUndefined();
  });

  it('does not sweep a room that has an active connection', () => {
    const manager = new RoomManager();
    const room = manager.createRoom(0, 'random');
    room.connect(fakeWs());
    let now = 1_000_000;
    manager.sweep(now);
    now += 60 * 60_000;
    manager.sweep(now);
    expect(manager.get(room.id)).toBeDefined();
  });
});
