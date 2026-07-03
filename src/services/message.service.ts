import db from '../db/connection';

export interface MessageMetadata {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: 'sent' | 'delivered' | 'read';
  sent_at: Date;
  delivered_at: Date | null;
  read_at: Date | null;
}

export interface OfflineMessage {
  id: string;
  message_id: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  sequence_number: number;
  timestamp: Date;
  delivered: boolean;
}

export class MessageService {
  /**
   * Record message metadata (no plaintext ever stored on server).
   */
  static async createMetadata(
    messageId: string,
    senderId: string,
    recipientId: string
  ): Promise<MessageMetadata> {
    const [metadata] = await db('message_metadata')
      .insert({
        id: messageId,
        sender_id: senderId,
        recipient_id: recipientId,
        status: 'sent',
      })
      .returning('*');
    return metadata;
  }

  /**
   * Update message status to delivered.
   */
  static async markDelivered(messageId: string): Promise<void> {
    await db('message_metadata')
      .where('id', messageId)
      .update({ status: 'delivered', delivered_at: new Date() });
  }

  /**
   * Update message status to read.
   */
  static async markRead(messageId: string): Promise<void> {
    await db('message_metadata')
      .where('id', messageId)
      .update({ status: 'read', read_at: new Date() });
  }

  /**
   * Mark all messages in a conversation as read.
   */
  static async markAllRead(recipientId: string, senderId: string): Promise<string[]> {
    const messages = await db('message_metadata')
      .where('recipient_id', recipientId)
      .where('sender_id', senderId)
      .where('status', '!=', 'read')
      .select('id');

    const ids = messages.map((m: any) => m.id);

    if (ids.length > 0) {
      await db('message_metadata')
        .whereIn('id', ids)
        .update({ status: 'read', read_at: new Date() });
    }

    return ids;
  }

  /**
   * Queue a message for offline delivery.
   */
  static async queueOfflineMessage(params: {
    messageId: string;
    senderId: string;
    recipientId: string;
    ciphertext: string;
    sequenceNumber: number;
  }): Promise<void> {
    await db('offline_message_queue').insert({
      message_id: params.messageId,
      sender_id: params.senderId,
      recipient_id: params.recipientId,
      ciphertext: params.ciphertext,
      sequence_number: params.sequenceNumber,
    });
  }

  /**
   * Get all pending offline messages for a user.
   */
  static async getPendingMessages(recipientId: string): Promise<OfflineMessage[]> {
    return db('offline_message_queue')
      .where('recipient_id', recipientId)
      .where('delivered', false)
      .orderBy('timestamp', 'asc');
  }

  /**
   * Mark offline messages as delivered and delete them.
   */
  static async clearDeliveredMessages(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    await db('offline_message_queue')
      .whereIn('message_id', messageIds)
      .del();
  }
}
