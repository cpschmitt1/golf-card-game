const STORAGE_KEY = 'golf-session';

export interface StoredSession {
  roomCode: string;
  playerId: string;
  playerToken: string;
}

/**
 * Uses localStorage: identity survives closing and reopening the tab, not just a refresh.
 * This means it's shared across every tab/window on this browser for this origin — opening
 * a second tab no longer gives you a second player, it just opens the same seat twice (the
 * server evicts whichever tab connected first; see App.tsx's 'io server disconnect' handling).
 * Testing multiple players locally now needs separate browsers or an incognito/private window.
 */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.roomCode === 'string' && typeof parsed?.playerId === 'string' && typeof parsed?.playerToken === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (private mode, etc.) — reconnect-after-refresh just won't work.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
