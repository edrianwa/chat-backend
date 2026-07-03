import { getRedis } from '../db/redis';
import db from '../db/connection';

const ONLINE_SET_KEY = 'presence:online';
const LAST_SEEN_PREFIX = 'presence:last_seen:';

export class PresenceService {
  /**
   * Mark a user as online in Redis.
   */
  static async setOnline(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.sadd(ONLINE_SET_KEY, userId);
  }

  /**
   * Mark a user as offline and record last seen.
   */
  static async setOffline(userId: string): Promise<void> {
    const redis = getRedis();
    const now = Date.now().toString();
    await redis.srem(ONLINE_SET_KEY, userId);
    await redis.set(`${LAST_SEEN_PREFIX}${userId}`, now);
    // Also persist to DB
    await db('users').where('id', userId).update({ last_seen: new Date() });
  }

  /**
   * Check if a user is currently online.
   */
  static async isOnline(userId: string): Promise<boolean> {
    const redis = getRedis();
    return (await redis.sismember(ONLINE_SET_KEY, userId)) === 1;
  }

  /**
   * Get online status for multiple users.
   */
  static async getOnlineStatuses(userIds: string[]): Promise<Record<string, boolean>> {
    const redis = getRedis();
    const result: Record<string, boolean> = {};
    for (const id of userIds) {
      result[id] = (await redis.sismember(ONLINE_SET_KEY, id)) === 1;
    }
    return result;
  }

  /**
   * Get last seen timestamp for a user.
   */
  static async getLastSeen(userId: string): Promise<number | null> {
    const redis = getRedis();
    const ts = await redis.get(`${LAST_SEEN_PREFIX}${userId}`);
    if (ts) return parseInt(ts, 10);
    // Fall back to DB
    const user = await db('users').where('id', userId).select('last_seen').first();
    return user?.last_seen ? new Date(user.last_seen).getTime() : null;
  }

  /**
   * Get all currently online user IDs.
   */
  static async getOnlineUsers(): Promise<string[]> {
    const redis = getRedis();
    return redis.smembers(ONLINE_SET_KEY);
  }
}
