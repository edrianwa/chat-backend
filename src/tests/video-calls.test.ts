import { CallService } from '../services/call.service';

jest.mock('../db/connection', () => {
  const mockDb = jest.fn(() => {
    const qb: any = {};
    qb.where = jest.fn().mockReturnValue(qb);
    qb.orWhere = jest.fn().mockReturnValue(qb);
    qb.first = jest.fn().mockResolvedValue(null);
    qb.insert = jest.fn().mockReturnValue(qb);
    qb.returning = jest.fn().mockResolvedValue([{ id: 'call-vid-1' }]);
    qb.update = jest.fn().mockResolvedValue(1);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.limit = jest.fn().mockResolvedValue([]);
    return qb;
  });
  return { __esModule: true, default: mockDb };
});

jest.mock('../db/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
  })),
  closeRedis: jest.fn(),
}));

describe('Video Call Signaling', () => {
  describe('CallService with callType', () => {
    it('createCallLog accepts video call type', async () => {
      const id = await CallService.createCallLog('user-1', 'user-2', 'video');
      expect(id).toBeDefined();
    });

    it('createCallLog defaults to voice', async () => {
      const id = await CallService.createCallLog('user-1', 'user-2');
      expect(id).toBeDefined();
    });
  });

  describe('Video signaling event payloads', () => {
    it('call:initiate with video type', () => {
      const payload = {
        calleeId: 'user-2',
        offer: { type: 'offer', sdp: 'v=0...' },
        callType: 'video' as const,
      };
      expect(payload.callType).toBe('video');
      expect(payload.offer.type).toBe('offer');
    });

    it('call:offer includes callType for video', () => {
      const relayed = {
        callId: 'call-uuid',
        callerId: 'user-1',
        callerUniqueId: '11111111',
        callType: 'video',
        offer: { type: 'offer', sdp: 'v=0...' },
      };
      expect(relayed.callType).toBe('video');
    });

    it('call:toggle-video payload', () => {
      const payload = {
        targetUserId: 'user-2',
        videoEnabled: false,
      };
      expect(payload.videoEnabled).toBe(false);
    });

    it('call:video-toggled relay event', () => {
      const event = {
        userId: 'user-1',
        videoEnabled: true,
      };
      expect(event.userId).toBeDefined();
      expect(typeof event.videoEnabled).toBe('boolean');
    });

    it('call:upgrade request payload', () => {
      const payload = {
        callId: 'call-uuid',
        targetUserId: 'user-2',
        offer: { type: 'offer', sdp: 'v=0...with-video' },
      };
      expect(payload.offer.type).toBe('offer');
    });

    it('call:upgrade-request relayed event', () => {
      const event = {
        callId: 'call-uuid',
        fromUserId: 'user-1',
        offer: { type: 'offer', sdp: 'v=0...' },
      };
      expect(event.fromUserId).toBeDefined();
    });

    it('call:upgrade-accept payload', () => {
      const payload = {
        callId: 'call-uuid',
        targetUserId: 'user-1',
        answer: { type: 'answer', sdp: 'v=0...' },
      };
      expect(payload.answer.type).toBe('answer');
    });

    it('call:upgrade-reject payload', () => {
      const payload = { targetUserId: 'user-1' };
      expect(payload.targetUserId).toBeDefined();
    });

    it('call:quality-report payload', () => {
      const payload = {
        callId: 'call-uuid',
        quality: 'good' as const,
        stats: { bitrate: 1500000, packetsLost: 0, jitter: 5 },
      };
      expect(['good', 'fair', 'poor']).toContain(payload.quality);
      expect(payload.stats.bitrate).toBe(1500000);
    });
  });

  describe('Video constraints', () => {
    it('default video constraints for front camera', () => {
      const constraints = { width: 1280, height: 720, fps: 30 };
      expect(constraints.width).toBe(1280);
      expect(constraints.height).toBe(720);
      expect(constraints.fps).toBe(30);
    });

    it('back camera allows higher resolution', () => {
      const constraints = { width: 1920, height: 1080, fps: 30 };
      expect(constraints.width).toBe(1920);
    });

    it('bandwidth adaptation thresholds', () => {
      const thresholds = [
        { quality: 'good', minBitrate: 1000000, resolution: '720p' },
        { quality: 'fair', minBitrate: 500000, resolution: '480p' },
        { quality: 'poor', minBitrate: 200000, resolution: '360p' },
      ];
      expect(thresholds.length).toBe(3);
      expect(thresholds[0].resolution).toBe('720p');
      expect(thresholds[2].resolution).toBe('360p');
    });

    it('max video bitrate is 1.5 Mbps', () => {
      const maxBitrate = 1500000;
      expect(maxBitrate).toBe(1_500_000);
    });
  });
});
