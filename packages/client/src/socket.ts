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
