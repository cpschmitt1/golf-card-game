type LogValue = string | number | boolean | null | undefined;

/**
 * One line per event on stdout, which Railway shows in the service's Logs tab. Nothing is stored
 * by us. Format is `[golf] event key=value key="quoted string"` so it's easy to search for
 * (e.g. `room=ABCD` or `action_rejected`). Never pass card contents or chat text in here.
 */
export function logEvent(event: string, fields: Record<string, LogValue> = {}): void {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${typeof value === 'string' ? JSON.stringify(value) : String(value)}`);
  }
  console.log(`[golf] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
}
