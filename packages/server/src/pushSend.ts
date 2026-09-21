import webpush from 'web-push';
import { deletePushSubscription, getPushSubscription } from './pushSubscriptions.js';

let configured = false;
let warnedMissingConfig = false;

/** Lazily configures VAPID details from env vars. Mirrors pushSubscriptions.ts's lazy-init
 *  pattern — a server without VAPID keys set still runs fine, sending just becomes a no-op. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    if (!warnedMissingConfig) {
      console.warn(
        'VAPID_SUBJECT / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not fully set — push notifications will not be sent.',
      );
      warnedMissingConfig = true;
    }
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
}

/**
 * Sends a push notification to a player if they have a stored subscription. Never throws —
 * a failed push should never break the game. If the push service reports the subscription as
 * gone (410 Gone, or 404 for an endpoint that no longer exists), the stored subscription is
 * deleted so we stop wasting sends on it; it'll be replaced automatically next time that
 * player's client re-subscribes (which happens on every room join/reconnect while permission
 * is granted).
 */
export async function sendPushToPlayer(playerId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;

    const subscription = await getPushSubscription(playerId);
    if (!subscription) return;

    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    const statusCode = (err as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // The push service says this subscription is gone (expired/revoked) — stop using it.
      // It'll be replaced automatically next time that client re-subscribes.
      await deletePushSubscription(playerId).catch(() => {});
    } else {
      console.error(`Failed to send push notification to player ${playerId}:`, err);
    }
  }
}
