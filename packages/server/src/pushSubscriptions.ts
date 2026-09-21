import { Redis } from '@upstash/redis';
import type { PushSubscriptionData } from '@golf/engine';

let client: Redis | null = null;
let warnedMissingConfig = false;

/**
 * Lazily builds the Upstash client from env vars, rather than at module load — so a server
 * running without Upstash configured (e.g. local dev before it's set up) doesn't crash on
 * startup just from importing this file. Push subscriptions are a purely additive feature;
 * nothing else about the game depends on them.
 */
function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingConfig) {
      console.warn(
        'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — push subscriptions will not be persisted.',
      );
      warnedMissingConfig = true;
    }
    return null;
  }
  client = new Redis({ url, token });
  return client;
}

function key(playerId: string): string {
  return `push-subscription:${playerId}`;
}

/** Stores (or overwrites) a player's push subscription. No-op if Upstash isn't configured. */
export async function savePushSubscription(playerId: string, subscription: PushSubscriptionData): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  await redis.set(key(playerId), subscription);
}

/** Returns null if the player has no stored subscription, or if Upstash isn't configured. */
export async function getPushSubscription(playerId: string): Promise<PushSubscriptionData | null> {
  const redis = getClient();
  if (!redis) return null;
  const record = await redis.get<PushSubscriptionData>(key(playerId));
  return record ?? null;
}

/** Removes a player's stored subscription (e.g. after a push fails because it's been revoked). */
export async function deletePushSubscription(playerId: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  await redis.del(key(playerId));
}
