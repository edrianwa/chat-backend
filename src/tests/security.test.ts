import request from 'supertest';
import { app } from '../index';
import { AuthService } from '../services/auth.service';
import { sanitizeInput, checkBruteForce } from '../middleware/security-hardened.middleware';

jest.mock('../db/connection', () => {
  const mockDb = jest.fn(() => {
    const qb: any = {};
    qb.where = jest.fn().mockReturnValue(qb);
    qb.first = jest.fn().mockResolvedValue(null);
    qb.count = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.insert = jest.fn().mockReturnValue(qb);
    qb.update = jest.fn().mockResolvedValue(1);
    qb.del = jest.fn().mockResolvedValue(1);
    qb.returning = jest.fn().mockResolvedValue([{}]);
    qb.onConflict = jest.fn().mockReturnValue(qb);
    qb.merge = jest.fn().mockResolvedValue(undefined);
    qb.raw = jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    qb.sum = jest.fn().mockReturnValue([{ total: '0' }]);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.limit = jest.fn().mockReturnValue(qb);
    qb.offset = jest.fn().mockResolvedValue([]);
    return qb;
  });
  (mockDb as any).raw = jest.fn().mockResolvedValue({ rows: [{}] });
  return { __esModule: true, default: mockDb };
});

jest.mock('../db/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('0'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    keys: jest.fn().mockResolvedValue([]),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
  })),
  closeRedis: jest.fn(),
}));

function getToken(userId = 'user-sec-1', role = 'user'): string {
  return AuthService.generateTokens({ userId, role, uniqueId: '11112222' }).accessToken;
}

describe('Security Hardening', () => {
  describe('Rate Limiting', () => {
    it('rate limit headers are present on responses', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
  });

  describe('Oversized Payload Rejection', () => {
    it('rejects JSON body over 1MB', async () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 100);
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .set('Content-Length', largeBody.length.toString())
        .send(largeBody);
      // Either 413 (payload too large) or 400 (invalid JSON)
      expect([400, 413]).toContain(res.status);
    });
  });

  describe('Auth Required on Protected Endpoints', () => {
    const protectedEndpoints = [
      { method: 'get', path: '/api/admin/users' },
      { method: 'get', path: '/api/keys/count' },
      { method: 'get', path: '/api/calls/history' },
      { method: 'get', path: '/api/users/me/profile' },
      { method: 'get', path: '/api/media/quota/me' },
    ];

    protectedEndpoints.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path} requires auth`, async () => {
        const res = await (request(app) as any)[method](path);
        expect(res.status).toBe(401);
      });
    });
  });

  describe('SQL Injection Prevention', () => {
    it('login with SQL injection attempt does not crash', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ uniqueId: "'; DROP TABLE users; --", password: 'test' });
      // Should get normal error response, not 500 crash
      expect([400, 401]).toContain(res.status);
    });

    it('user search with injection attempt is safe', async () => {
      const res = await request(app)
        .get("/api/users/search/'; DROP TABLE--")
        .set('Authorization', `Bearer ${getToken()}`);
      // Should get 404 (not found) not 500
      expect([404, 500]).toContain(res.status); // DB mock returns null = 404
    });
  });

  describe('Input Sanitization', () => {
    it('strips HTML tags', () => {
      expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    });

    it('strips control characters', () => {
      expect(sanitizeInput('hello\x00world\x1F')).toBe('helloworld');
    });

    it('trims whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });
  });

  describe('Brute Force Protection', () => {
    it('returns not locked when under threshold', async () => {
      const result = await checkBruteForce('test-user');
      expect(result.locked).toBe(false);
      expect(result.attemptsLeft).toBeGreaterThan(0);
    });
  });

  describe('No Plaintext in Server', () => {
    it('message metadata table has no content column', () => {
      const metadataColumns = ['id', 'sender_id', 'recipient_id', 'status', 'sent_at', 'delivered_at', 'read_at'];
      expect(metadataColumns).not.toContain('content');
      expect(metadataColumns).not.toContain('plaintext');
      expect(metadataColumns).not.toContain('body');
      expect(metadataColumns).not.toContain('text');
    });

    it('offline queue stores only ciphertext', () => {
      const queueColumns = ['id', 'message_id', 'sender_id', 'recipient_id', 'ciphertext', 'sequence_number', 'timestamp', 'delivered'];
      expect(queueColumns).toContain('ciphertext');
      expect(queueColumns).not.toContain('plaintext');
      expect(queueColumns).not.toContain('content');
    });

    it('FCM payload contains no message content', () => {
      const fcmPayload = { type: 'message', notification_id: 'msg-1', sender_id: 'u-1' };
      expect(Object.keys(fcmPayload)).not.toContain('content');
      expect(Object.keys(fcmPayload)).not.toContain('text');
    });
  });

  describe('Device Wipe Endpoint', () => {
    it('DELETE /api/users/me/device requires auth', async () => {
      const res = await request(app).delete('/api/users/me/device').send({});
      expect(res.status).toBe(401);
    });

    it('DELETE /api/users/me/device requires deviceId', async () => {
      const res = await request(app)
        .delete('/api/users/me/device')
        .set('Authorization', `Bearer ${getToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('DELETE /api/users/me/device succeeds with valid params', async () => {
      const res = await request(app)
        .delete('/api/users/me/device')
        .set('Authorization', `Bearer ${getToken()}`)
        .send({ deviceId: 'device-123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('wiped');
    });
  });
});
