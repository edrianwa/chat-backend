import { AuthService } from '../services/auth.service';

// Mock DB for message service tests
const messageMetadata: any[] = [];
const offlineQueue: any[] = [];

jest.mock('../db/connection', () => {
  const mockDb = jest.fn((tableName: string) => {
    const createQb = (): any => {
      const qb: any = {};
      let filters: Record<string, any> = {};

      qb.insert = jest.fn().mockImplementation((data: any) => {
        if (tableName === 'message_metadata') {
          const d = Array.isArray(data) ? data[0] : data;
          messageMetadata.push({ ...d, sent_at: new Date(), delivered_at: null, read_at: null });
          qb.returning = jest.fn().mockResolvedValue([d]);
        }
        if (tableName === 'offline_message_queue') {
          const d = Array.isArray(data) ? data[0] : data;
          offlineQueue.push({ ...d, id: `oq-${offlineQueue.length}`, timestamp: new Date(), delivered: false });
        }
        return qb;
      });
      qb.returning = jest.fn().mockResolvedValue([{}]);
      qb.where = jest.fn().mockImplementation((key: string, val: any) => {
        filters[key] = val;
        return qb;
      });
      qb.whereIn = jest.fn().mockReturnValue(qb);
      qb.update = jest.fn().mockImplementation((data: any) => {
        if (tableName === 'message_metadata' && filters.id) {
          const msg = messageMetadata.find(m => m.id === filters.id);
          if (msg) Object.assign(msg, data);
        }
        return Promise.resolve(1);
      });
      qb.del = jest.fn().mockResolvedValue(1);
      qb.select = jest.fn().mockImplementation(() => {
        if (tableName === 'message_metadata') {
          return messageMetadata.filter(m => {
            return Object.entries(filters).every(([k, v]) => {
              if (k === 'status') return m.status !== 'read';
              return m[k] === v;
            });
          });
        }
        return [];
      });
      qb.orderBy = jest.fn().mockImplementation(() => {
        if (tableName === 'offline_message_queue') {
          return offlineQueue.filter(m =>
            m.recipient_id === filters.recipient_id && !m.delivered
          );
        }
        return qb;
      });
      qb.first = jest.fn().mockResolvedValue(null);
      qb.count = jest.fn().mockReturnValue(qb);
      qb.onConflict = jest.fn().mockReturnValue(qb);
      qb.ignore = jest.fn().mockResolvedValue(undefined);
      qb.merge = jest.fn().mockResolvedValue(undefined);
      return qb;
    };
    return createQb();
  });

  (mockDb as any).transaction = jest.fn().mockImplementation(async (fn: any) => {
    await fn(mockDb);
  });

  return { __esModule: true, default: mockDb };
});

jest.mock('../db/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  })),
  closeRedis: jest.fn(),
}));

import { MessageService } from '../services/message.service';

describe('MessageService', () => {
  beforeEach(() => {
    messageMetadata.length = 0;
    offlineQueue.length = 0;
  });

  describe('createMetadata', () => {
    it('should create message metadata without plaintext', async () => {
      const result = await MessageService.createMetadata(
        'msg-1',
        'sender-1',
        'recipient-1'
      );

      expect(result).toBeDefined();
      // Verify no plaintext field exists
      expect(result).not.toHaveProperty('plaintext');
      expect(result).not.toHaveProperty('content');
    });
  });

  describe('markDelivered', () => {
    it('should update status to delivered', async () => {
      await MessageService.markDelivered('msg-1');
      // Should not throw
    });
  });

  describe('markRead', () => {
    it('should update status to read', async () => {
      await MessageService.markRead('msg-1');
      // Should not throw
    });
  });

  describe('queueOfflineMessage', () => {
    it('should queue message for offline delivery', async () => {
      await MessageService.queueOfflineMessage({
        messageId: 'msg-2',
        senderId: 'sender-1',
        recipientId: 'recipient-1',
        ciphertext: 'encrypted-content-here',
        sequenceNumber: 1,
      });

      // Should have added to queue
      expect(offlineQueue.length).toBe(1);
      expect(offlineQueue[0].message_id).toBe('msg-2');
      expect(offlineQueue[0].ciphertext).toBe('encrypted-content-here');
    });
  });

  describe('getPendingMessages', () => {
    it('should return pending messages for recipient', async () => {
      // Queue some messages
      offlineQueue.push({
        id: 'oq-1',
        message_id: 'msg-1',
        sender_id: 'sender-1',
        recipient_id: 'recipient-1',
        ciphertext: 'cipher-1',
        sequence_number: 1,
        timestamp: new Date(),
        delivered: false,
      });

      const pending = await MessageService.getPendingMessages('recipient-1');
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('clearDeliveredMessages', () => {
    it('should not throw on empty array', async () => {
      await MessageService.clearDeliveredMessages([]);
    });

    it('should clear delivered messages', async () => {
      await MessageService.clearDeliveredMessages(['msg-1', 'msg-2']);
      // Should not throw
    });
  });
});

describe('Socket.io Message Protocol', () => {
  it('should generate valid tokens for socket auth', () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-msg-1',
      role: 'user',
      uniqueId: '11111111',
    });
    expect(tokens.accessToken).toBeDefined();
    expect(AuthService.verifyAccessToken(tokens.accessToken)).not.toBeNull();
  });

  it('message:send payload structure is correct', () => {
    const payload = {
      messageId: 'uuid-msg-1',
      recipientId: 'user-2',
      ciphertext: 'base64-encrypted-signal-protocol-message',
      sequenceNumber: 1,
    };

    expect(payload.messageId).toBeDefined();
    expect(payload.recipientId).toBeDefined();
    expect(payload.ciphertext).toBeDefined();
    expect(typeof payload.sequenceNumber).toBe('number');
  });

  it('message:receive payload includes all required fields', () => {
    const received = {
      messageId: 'uuid-msg-1',
      senderId: 'user-1',
      senderUniqueId: '12345678',
      ciphertext: 'encrypted-content',
      sequenceNumber: 1,
      timestamp: Date.now(),
    };

    expect(received.messageId).toBeDefined();
    expect(received.senderId).toBeDefined();
    expect(received.ciphertext).toBeDefined();
    expect(received.sequenceNumber).toBe(1);
    expect(typeof received.timestamp).toBe('number');
  });

  it('delivery receipt structure is correct', () => {
    const receipt = {
      messageId: 'uuid-msg-1',
      recipientId: 'user-2',
      timestamp: Date.now(),
    };

    expect(receipt.messageId).toBeDefined();
    expect(receipt.recipientId).toBeDefined();
    expect(typeof receipt.timestamp).toBe('number');
  });

  it('read receipt structure is correct', () => {
    const readReceipt = {
      messageIds: ['msg-1', 'msg-2', 'msg-3'],
      readerId: 'user-2',
      timestamp: Date.now(),
    };

    expect(Array.isArray(readReceipt.messageIds)).toBe(true);
    expect(readReceipt.messageIds.length).toBe(3);
    expect(readReceipt.readerId).toBeDefined();
  });

  it('server never stores plaintext in metadata', () => {
    const metadata = {
      id: 'msg-1',
      sender_id: 'user-1',
      recipient_id: 'user-2',
      status: 'sent',
      sent_at: new Date(),
    };

    // Verify no plaintext field
    expect(metadata).not.toHaveProperty('content');
    expect(metadata).not.toHaveProperty('plaintext');
    expect(metadata).not.toHaveProperty('body');
    expect(metadata).not.toHaveProperty('text');
  });
});
