import db from '../db/connection';
import { getRedis } from '../db/redis';

export interface FcmToken {
  id: string;
  user_id: string;
  token: string;
  device_id: string;
  updated_at: Date;
}

/**
 * Manages FCM tokens and notification delivery logic.
 * In production: uses firebase-admin SDK to send messages.
 * Here we implement the logic/routing; actual Firebase send is abstracted.
 */
export class NotificationService {
  private static readonly BATCH_DELAY_MS = 2000;
  private static readonly BATCH_KEY_PREFIX = 'notif:batch:';

  // --- Token Management ---

  /**
   * Register or update an FCM token for a user/device.
   */
  static async registerToken(userId: string, token: string, deviceId: string): Promise<void> {
    await db('fcm_tokens')
      .insert({ user_id: userId, token, device_id: deviceId })
      .onConflict(['user_id', 'device_id'])
      .merge({ token, updated_at: new Date() });
  }

  /**
   * Remove an FCM token (on logout or invalid).
   */
  static async removeToken(userId: string, deviceId: string): Promise<void> {
    await db('fcm_tokens')
      .where('user_id', userId)
      .where('device_id', deviceId)
      .del();
  }

  /**
   * Remove a specific token string (when FCM reports invalid).
   */
  static async removeInvalidToken(token: string): Promise<void> {
    await db('fcm_tokens').where('token', token).del();
  }

  /**
   * Get all FCM tokens for a user.
   */
  static async getTokensForUser(userId: string): Promise<string[]> {
    const rows = await db('fcm_tokens').where('user_id', userId).select('token');
    return rows.map((r: any) => r.token);
  }

  // --- Notification Sending Logic ---

  /**
   * Send a message notification to a user.
   * Only sends if user is offline (not connected via Socket.io).
   * Respects mute settings and implements batching for rapid messages.
   */
  static async sendMessageNotification(
    recipientId: string,
    senderId: string,
    messageId: string,
    isRecipientOnline: boolean
  ): Promise<boolean> {
    // Don't send FCM if recipient is connected via Socket.io
    if (isRecipientOnline) return false;

    // Check if chat is muted
    const chatSettings = await db('chat_settings')
      .where('user_id', recipientId)
      .where('chat_id', senderId)
      .first();
    if (chatSettings?.muted) return false;

    // Batch: check if we already have a pending notification for this sender
    const redis = getRedis();
    const batchKey = `${this.BATCH_KEY_PREFIX}${recipientId}:${senderId}`;
    const existing = await redis.get(batchKey);
    if (existing) {
      // Already have a pending notification, skip (batching)
      return false;
    }

    // Set batch lock (2 second window)
    await redis.set(batchKey, messageId, 'PX', this.BATCH_DELAY_MS);

    // Get tokens
    const tokens = await this.getTokensForUser(recipientId);
    if (tokens.length === 0) return false;

    // Build FCM payload (NO message content — only metadata)
    const payload = {
      type: 'message',
      notification_id: messageId,
      sender_id: senderId,
    };

    // Send to all user devices
    await this.sendFcmToTokens(tokens, payload, 'normal');
    return true;
  }

  /**
   * Send a call notification (high priority, immediate).
   */
  static async sendCallNotification(
    recipientId: string,
    callerId: string,
    callType: 'voice' | 'video'
  ): Promise<boolean> {
    const tokens = await this.getTokensForUser(recipientId);
    if (tokens.length === 0) return false;

    const payload = {
      type: 'call',
      caller_id: callerId,
      call_type: callType,
    };

    await this.sendFcmToTokens(tokens, payload, 'high');
    return true;
  }

  /**
   * Send an admin alert notification (low priority).
   */
  static async sendAdminNotification(
    recipientId: string,
    alertType: string,
    message: string
  ): Promise<boolean> {
    const tokens = await this.getTokensForUser(recipientId);
    if (tokens.length === 0) return false;

    const payload = {
      type: 'admin',
      alert_type: alertType,
      message,
    };

    await this.sendFcmToTokens(tokens, payload, 'normal');
    return true;
  }

  /**
   * Abstract FCM send — in production uses firebase-admin.
   * Returns list of invalid tokens (for cleanup).
   */
  private static async sendFcmToTokens(
    tokens: string[],
    data: Record<string, string>,
    priority: 'high' | 'normal'
  ): Promise<string[]> {
    // In production:
    // const admin = require('firebase-admin');
    // const message = { data, tokens, android: { priority } };
    // const response = await admin.messaging().sendEachForMulticast(message);
    // Clean up invalid tokens from response.responses

    // For now, log the send attempt
    console.log(`[FCM] Sending ${priority} priority to ${tokens.length} device(s):`, data.type);

    // Return empty (no invalid tokens in dev)
    return [];
  }
}
