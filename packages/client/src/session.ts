const STORAGE_KEY = 'golf-session';

export interface StoredSession {
  roomCode: string;
  playerId: string;
  playerToken: string;
}

/**
 * Uses sessionStorage (not localStorage) on purpose: it survives a refresh/reload of the same
 * tab — exactly what reconnect needs — but is NOT shared across tabs, so opening multiple tabs
 * to play as multiple people (e.g. for local testing) still gives each tab its own identity.
 */
export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — reconnect-after-refresh just won't work.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
