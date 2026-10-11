import type { ClientToServerEvents, ServerToClientEvents } from '@golf/engine';
import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: true,
  // Harmless in production; needed when VITE_SERVER_URL points at a localtunnel/ngrok URL for
  // local testing — both show a one-time "click to continue" interstitial to real browsers,
  // which blocks XHR/websocket requests (no way to click through those) unless these are set.
  extraHeaders: { 'bypass-tunnel-reminder': 'true', 'ngrok-skip-browser-warning': 'true' },
});

/**
 * Tells the server about something only this device can see (it ends up as a line in the server
 * log). Best effort: silently does nothing if the connection is down, and a server that predates
 * the event just ignores it.
 */
export function reportToServer(kind: string, detail: string): void {
  if (!socket.connected) return;
  socket.emit('client:log', { kind, detail: detail.slice(0, 300), ua: navigator.userAgent.slice(0, 160) });
}
