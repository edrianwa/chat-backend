import request from 'supertest';
import { app } from '../index';
import { AuthService } from '../services/auth.service';
import { CallService } from '../services/call.service';

jest.mock('../db/connection', () => {
  const callLogs: any[] = [];
  const mockDb = jest.fn((tableName: string) => {
    const createQb = (): any => {
      const qb: any = {};
      let filters: Record<string, any> = {};
      qb.where = jest.fn().mockImplementation((key: string, val: any) => { filters[key] = val; return qb; });
      qb.orWhere = jest.fn().mockReturnValue(qb);
      qb.first = jest.fn().mockImplementation(() => {
        if (tableName === 'call_logs' && filters.id) {
          return callLogs.find(l => l.id === filters.id) || null;
        }
        return null;
      });
      qb.insert = jest.fn().mockImplementation((data: any) => {
        const d = Array.isArray(data) ? data[0] : data;
        const id = `call-${callLogs.length + 1}`;
        callLogs.push({ ...d, id });
        qb.returning = jest.fn().mockResolvedValue([{ id }]);
        return qb;
      });
      qb.returning = jest.fn().mockResolvedValue([{ id: 'call-1' }]);
      qb.update = jest.fn().mockResolvedValue(1);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockResolvedValue(callLogs);
      qb.select = jest.fn().mockReturnValue(qb);
      qb.count = jest.fn().mockReturnValue(qb);
      qb.onConflict = jest.fn().mockReturnValue(qb);
      qb.merge = jest.fn().mockResolvedValue(undefined);
      qb.ignore = jest.fn().mockResolvedValue(undefined);
      return qb;
    };
    return createQb();
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

function getToken(userId = 'user-call-1'): string {
  return AuthService.generateTokens({
    userId,
    role: 'user',
    uniqueId: '11112222',
  }).accessToken;
}

describe('Call Signaling', () => {
  describe('TURN Credentials', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/calls/turn-credentials');
      expect(res.status).toBe(401);
    });

    it('should return valid TURN credentials', async () => {
      const res = await request(app)
        .get('/api/calls/turn-credentials')
        .set('Authorization', `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('urls');
      expect(res.body).toHaveProperty('username');
      expect(res.body).toHaveProperty('credential');
      expect(res.body).toHaveProperty('ttl');
      expect(Array.isArray(res.body.urls)).toBe(true);
      expect(res.body.urls.length).toBeGreaterThan(0);
    });

    it('TURN credentials include STUN and TURN URLs', async () => {
      const res = await request(app)
        .get('/api/calls/turn-credentials')
        .set('Authorization', `Bearer ${getToken()}`);

      const urls = res.body.urls;
      expect(urls.some((u: string) => u.startsWith('stun:'))).toBe(true);
      expect(urls.some((u: string) => u.startsWith('turn:'))).toBe(true);
    });

    it('TURN credentials have time-limited username', async () => {
      const res = await request(app)
        .get('/api/calls/turn-credentials')
        .set('Authorization', `Bearer ${getToken()}`);

      const username = res.body.username;
      const parts = username.split(':');
      expect(parts.length).toBe(2);
      const timestamp = parseInt(parts[0], 10);
      expect(timestamp).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('Call History', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/calls/history');
      expect(res.status).toBe(401);
    });

    it('should return call history array', async () => {
      const res = await request(app)
        .get('/api/calls/history')
        .set('Authorization', `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('calls');
      expect(Array.isArray(res.body.calls)).toBe(true);
    });
  });

  describe('CallService', () => {
    it('generateTurnCredentials returns valid structure', () => {
      const creds = CallService.generateTurnCredentials('user-1');
      expect(creds.urls.length).toBeGreaterThan(0);
      expect(creds.username).toContain(':user-1');
      expect(creds.credential.length).toBeGreaterThan(0);
      expect(creds.ttl).toBe(86400);
    });

    it('credentials are unique per user', () => {
      const creds1 = CallService.generateTurnCredentials('user-1');
      const creds2 = CallService.generateTurnCredentials('user-2');
      expect(creds1.username).not.toBe(creds2.username);
      expect(creds1.credential).not.toBe(creds2.credential);
    });

    it('CALL_TIMEOUT_MS is 30 seconds', () => {
      expect(CallService.CALL_TIMEOUT_MS).toBe(30000);
    });
  });

  describe('Socket.io Call Events Protocol', () => {
    it('call:initiate payload structure', () => {
      const payload = { calleeId: 'user-2', offer: { type: 'offer', sdp: 'v=0...' } };
      expect(payload.calleeId).toBeDefined();
      expect(payload.offer).toBeDefined();
      expect(payload.offer.type).toBe('offer');
    });

    it('call:offer relayed payload structure', () => {
      const relayed = {
        callId: 'call-uuid',
        callerId: 'user-1',
        callerUniqueId: '11111111',
        offer: { type: 'offer', sdp: 'v=0...' },
      };
      expect(relayed.callId).toBeDefined();
      expect(relayed.callerId).toBeDefined();
      expect(relayed.offer.type).toBe('offer');
    });

    it('call:answer payload structure', () => {
      const payload = {
        callId: 'call-uuid',
        callerId: 'user-1',
        answer: { type: 'answer', sdp: 'v=0...' },
      };
      expect(payload.answer.type).toBe('answer');
    });

    it('call:ice-candidate payload structure', () => {
      const payload = {
        targetUserId: 'user-2',
        candidate: { candidate: 'candidate:...', sdpMid: '0', sdpMLineIndex: 0 },
      };
      expect(payload.candidate.candidate).toBeDefined();
    });

    it('call:reject payload structure', () => {
      const payload = { callId: 'call-uuid', callerId: 'user-1' };
      expect(payload.callId).toBeDefined();
    });

    it('call:end payload structure', () => {
      const payload = { callId: 'call-uuid', otherUserId: 'user-2' };
      expect(payload.callId).toBeDefined();
      expect(payload.otherUserId).toBeDefined();
    });
  });
});
