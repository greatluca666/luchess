import type WebSocket from 'ws';
import type { Room } from './room.js';

export function handleMessage(room: Room, ws: WebSocket, raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(ws, 'invalid message');
    return;
  }

  const seat = room.seatColorFor(ws);
  if (!seat) {
    sendError(ws, 'not connected to a seat');
    return;
  }

  let result: { ok: boolean; error?: string };
  switch (msg.type) {
    case 'move':
      result = room.move(seat, { from: msg.from, to: msg.to, promotion: msg.promotion });
      break;
    case 'resign':
      result = room.resign(seat);
      break;
    case 'offerDraw':
      result = room.offerDraw(seat);
      break;
    case 'respondDraw':
      result = room.respondDraw(seat, !!msg.accept);
      break;
    case 'offerUndo':
      result = room.offerUndo(seat);
      break;
    case 'respondUndo':
      result = room.respondUndo(seat, !!msg.accept);
      break;
    default:
      result = { ok: false, error: `unknown message type: ${msg.type}` };
  }
  if (!result.ok) sendError(ws, result.error ?? 'unknown error');
}

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === (ws as any).OPEN) ws.send(JSON.stringify({ type: 'error', message }));
}
