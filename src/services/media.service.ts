import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

export interface MediaMetadata {
  id: string;
  uploader_id: string;
  chat_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_at: Date;
  expires_at: Date | null;
  is_deleted: boolean;
}

export class MediaService {
  // Storage base path (in production this would be GCP Cloud Storage)
  private static readonly STORAGE_BASE = process.env.MEDIA_STORAGE_PATH || './media-storage';

  /**
   * Upload and store an encrypted media file.
   * Returns the media metadata record.
   */
  static async uploadMedia(params: {
    uploaderId: string;
    chatId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileBuffer: Buffer;
  }): Promise<MediaMetadata> {
    const mediaId = uuidv4();
    const ext = path.extname(params.fileName) || '.bin';
    const storagePath = `${params.uploaderId}/${mediaId}${ext}`;

    // Calculate TTL from chat settings
    const chatSettings = await db('chat_settings')
      .where('user_id', params.uploaderId)
      .where('chat_id', params.chatId)
      .first();

    let expiresAt: Date | null = null;
    if (chatSettings?.media_ttl_days) {
      expiresAt = new Date(Date.now() + chatSettings.media_ttl_days * 24 * 60 * 60 * 1000);
    }

    // Store file (local filesystem for dev, GCP Cloud Storage in production)
    await this.storeFile(storagePath, params.fileBuffer);

    // Record metadata
    const [metadata] = await db('media_metadata')
      .insert({
        id: mediaId,
        uploader_id: params.uploaderId,
        chat_id: params.chatId,
        file_name: params.fileName,
        file_size: params.fileSize,
        mime_type: params.mimeType,
        storage_path: storagePath,
        expires_at: expiresAt,
      })
      .returning('*');

    // Update storage quota
    await this.addToQuota(params.uploaderId, params.fileSize);

    return metadata;
  }

  /**
   * Get media metadata by ID.
   */
  static async getMedia(mediaId: string): Promise<MediaMetadata | null> {
    const media = await db('media_metadata')
      .where('id', mediaId)
      .where('is_deleted', false)
      .first();
    return media || null;
  }

  /**
   * Get the file buffer for a media item.
   */
  static async getMediaFile(storagePath: string): Promise<Buffer | null> {
    return this.readFile(storagePath);
  }

  /**
   * Delete a media item (soft delete + remove from storage).
   */
  static async deleteMedia(mediaId: string, userId: string): Promise<boolean> {
    const media = await db('media_metadata')
      .where('id', mediaId)
      .where('uploader_id', userId)
      .first();

    if (!media) return false;

    // Remove from storage
    await this.removeFile(media.storage_path);

    // Soft delete
    await db('media_metadata')
      .where('id', mediaId)
      .update({ is_deleted: true, deleted_at: new Date() });

    // Update quota
    await this.subtractFromQuota(userId, media.file_size);

    return true;
  }

  /**
   * Delete all expired media. Called by the auto-delete scheduler.
   */
  static async deleteExpiredMedia(): Promise<number> {
    const expired = await db('media_metadata')
      .where('is_deleted', false)
      .whereNotNull('expires_at')
      .where('expires_at', '<', new Date())
      .select('*');

    let deleted = 0;
    for (const media of expired) {
      await this.removeFile(media.storage_path);
      await db('media_metadata')
        .where('id', media.id)
        .update({ is_deleted: true, deleted_at: new Date() });
      await this.subtractFromQuota(media.uploader_id, media.file_size);
      deleted++;
    }

    return deleted;
  }

  /**
   * Check if user is within storage quota.
   */
  static async checkQuota(userId: string, additionalBytes: number): Promise<{ allowed: boolean; used: number; max: number }> {
    let quota = await db('storage_quota').where('user_id', userId).first();
    if (!quota) {
      // Create default quota entry
      await db('storage_quota').insert({ user_id: userId, used_bytes: 0 });
      quota = { used_bytes: 0, max_bytes: 524288000 }; // 500MB
    }
    const used = parseInt(quota.used_bytes, 10);
    const max = parseInt(quota.max_bytes, 10);
    return { allowed: used + additionalBytes <= max, used, max };
  }

  /**
   * Get chat media TTL settings.
   */
  static async getChatTTL(userId: string, chatId: string): Promise<number | null> {
    const settings = await db('chat_settings')
      .where('user_id', userId)
      .where('chat_id', chatId)
      .first();
    return settings?.media_ttl_days || null;
  }

  /**
   * Set chat media TTL.
   */
  static async setChatTTL(userId: string, chatId: string, ttlDays: number | null): Promise<void> {
    await db('chat_settings')
      .insert({
        user_id: userId,
        chat_id: chatId,
        media_ttl_days: ttlDays,
        updated_at: new Date(),
      })
      .onConflict(['user_id', 'chat_id'])
      .merge({
        media_ttl_days: ttlDays,
        updated_at: new Date(),
      });
  }

  // --- Storage helpers (local filesystem for dev) ---

  private static async storeFile(storagePath: string, buffer: Buffer): Promise<void> {
    const fullPath = path.join(this.STORAGE_BASE, storagePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, buffer);
  }

  private static async readFile(storagePath: string): Promise<Buffer | null> {
    const fullPath = path.join(this.STORAGE_BASE, storagePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath);
  }

  private static async removeFile(storagePath: string): Promise<void> {
    const fullPath = path.join(this.STORAGE_BASE, storagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  private static async addToQuota(userId: string, bytes: number): Promise<void> {
    const exists = await db('storage_quota').where('user_id', userId).first();
    if (exists) {
      await db('storage_quota')
        .where('user_id', userId)
        .increment('used_bytes', bytes)
        .update({ updated_at: new Date() });
    } else {
      await db('storage_quota').insert({ user_id: userId, used_bytes: bytes });
    }
  }

  private static async subtractFromQuota(userId: string, bytes: number): Promise<void> {
    await db('storage_quota')
      .where('user_id', userId)
      .decrement('used_bytes', bytes)
      .update({ updated_at: new Date() });
  }
}
