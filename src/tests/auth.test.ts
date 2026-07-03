import request from 'supertest';
import { app } from '../index';
import { AuthService } from '../services/auth.service';

// Mock database and Redis for unit testing
jest.mock('../db/connection', () => {
  const users: Record<string, any> = {};
  const invites: Record<string, any> = {};
  const settings: Record<string, any> = {
    user_cap: { key: 'user_cap', value: '100' },
    registration_enabled: { key: 'registration_enabled', value: 'true' },
  };

  const mockDb = jest.fn((tableName: string) => {
    const createQueryBuilder = () => ({
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => {
        if (tableName === 'users') {
          const id = 'test-user-id-' + Date.now();
          const user = {
            id,
            unique_id_number: '12345678',
            display_name: 'Test User',
            password_hash: '$2b$12$LJ3Iw/oRZmVMPVuLjOxJX.x3AuO7mQHt5pT6U5FiCVzT1lZ1C1IrW',
            role: 'user',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
          };
          users[id] = user;
          return [user];
        }
        if (tableName === 'invites') {
          const invite = {
            id: 'test-invite-id',
            code: 'TESTCODE',
            created_by: 'admin-id',
            used_by: null,
            is_used: false,
            expires_at: null,
            created_at: new Date(),
          };
          invites['TESTCODE'] = invite;
          return [invite];
        }
        return [{}];
      }),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      first: jest.fn().mockImplementation(() => null),
      count: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      merge: jest.fn().mockReturnThis(),
    });

    return createQueryBuilder();
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

describe('Auth Service - JWT', () => {
  it('should generate valid token pair', () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-123',
      role: 'user',
      uniqueId: '12345678',
    });

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
  });

  it('should verify a valid access token', () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-123',
      role: 'admin',
      uniqueId: '87654321',
    });

    const payload = AuthService.verifyAccessToken(tokens.accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user-123');
    expect(payload?.role).toBe('admin');
    expect(payload?.uniqueId).toBe('87654321');
  });

  it('should return null for invalid access token', () => {
    const payload = AuthService.verifyAccessToken('invalid.token.here');
    expect(payload).toBeNull();
  });

  it('should verify a valid refresh token', () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-456',
      role: 'user',
      uniqueId: '11111111',
    });

    const decoded = AuthService.verifyRefreshToken(tokens.refreshToken);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe('user-456');
  });

  it('should return null for invalid refresh token', () => {
    const decoded = AuthService.verifyRefreshToken('garbage');
    expect(decoded).toBeNull();
  });
});

describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ inviteCode: 'ABC', displayName: 'Test', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('6 characters');
    });

    it('should reject invalid display name length', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ inviteCode: 'ABC', displayName: 'A', password: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('2-64');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject missing credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ uniqueId: '99999999', password: 'password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid credentials');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });
});

describe('Auth Middleware', () => {
  it('should reject requests without Authorization header', async () => {
    const res = await request(app)
      .get('/api/admin/users');

    expect(res.status).toBe(401);
  });

  it('should reject requests with invalid token', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('should reject non-admin users for admin routes', async () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-123',
      role: 'user',
      uniqueId: '12345678',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('should allow admin users for admin routes', async () => {
    const tokens = AuthService.generateTokens({
      userId: 'admin-123',
      role: 'admin',
      uniqueId: '00000001',
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    // Should not be 401/403 — might be 500 due to mocked DB but auth passes
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
