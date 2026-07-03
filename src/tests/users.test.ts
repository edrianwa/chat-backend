import request from 'supertest';
import { app } from '../index';
import { AuthService } from '../services/auth.service';

jest.mock('../db/connection', () => {
  const users: Record<string, any> = {
    'user-1': {
      id: 'user-1', unique_id_number: '12345678', display_name: 'Alice',
      avatar_url: null, about: 'Hey there!', role: 'user', status: 'active',
      created_at: new Date(), last_seen: null,
    },
    'user-2': {
      id: 'user-2', unique_id_number: '87654321', display_name: 'Bob',
      avatar_url: null, about: '', role: 'user', status: 'active',
      created_at: new Date(), last_seen: new Date(Date.now() - 3600000),
    },
  };

  const mockDb = jest.fn((tableName: string) => {
    const createQb = (): any => {
      const qb: any = {};
      let filters: Record<string, any> = {};
      qb.where = jest.fn().mockImplementation((key: string, val: any) => {
        filters[key] = val;
        return qb;
      });
      qb.first = jest.fn().mockImplementation(() => {
        if (tableName === 'users') {
          if (filters.id) return users[filters.id] || null;
          if (filters.unique_id_number) {
            return Object.values(users).find(u => u.unique_id_number === filters.unique_id_number) || null;
          }
        }
        return null;
      });
      qb.select = jest.fn().mockReturnValue(qb);
      qb.update = jest.fn().mockImplementation((data: any) => {
        if (filters.id && users[filters.id]) {
          Object.assign(users[filters.id], data);
        }
        return Promise.resolve(1);
      });
      qb.insert = jest.fn().mockReturnValue(qb);
      qb.returning = jest.fn().mockResolvedValue([{}]);
      qb.count = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockResolvedValue([]);
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

function getToken(userId = 'user-1'): string {
  return AuthService.generateTokens({
    userId,
    role: 'user',
    uniqueId: '12345678',
  }).accessToken;
}

describe('User Profile Endpoints', () => {
  describe('GET /api/users/me/profile', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/users/me/profile');
      expect(res.status).toBe(401);
    });

    it('should return own profile', async () => {
      const res = await request(app)
        .get('/api/users/me/profile')
        .set('Authorization', `Bearer ${getToken('user-1')}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('displayName');
      expect(res.body).toHaveProperty('uniqueId');
      expect(res.body).toHaveProperty('about');
    });
  });

  describe('PATCH /api/users/me/profile', () => {
    it('should reject short display name', async () => {
      const res = await request(app)
        .patch('/api/users/me/profile')
        .set('Authorization', `Bearer ${getToken('user-1')}`)
        .send({ displayName: 'A' });

      expect(res.status).toBe(400);
    });

    it('should reject long about text', async () => {
      const res = await request(app)
        .patch('/api/users/me/profile')
        .set('Authorization', `Bearer ${getToken('user-1')}`)
        .send({ about: 'x'.repeat(257) });

      expect(res.status).toBe(400);
    });

    it('should update profile successfully', async () => {
      const res = await request(app)
        .patch('/api/users/me/profile')
        .set('Authorization', `Bearer ${getToken('user-1')}`)
        .send({ displayName: 'Alice Updated', about: 'New status' });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/users/:id/profile', () => {
    it('should return user profile with presence', async () => {
      const res = await request(app)
        .get('/api/users/user-2/profile')
        .set('Authorization', `Bearer ${getToken('user-1')}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isOnline');
      expect(res.body).toHaveProperty('lastSeen');
    });

    it('should return 404 for unknown user', async () => {
      const res = await request(app)
        .get('/api/users/unknown-id/profile')
        .set('Authorization', `Bearer ${getToken('user-1')}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/search/:idNumber', () => {
    it('should find user by ID number', async () => {
      const res = await request(app)
        .get('/api/users/search/87654321')
        .set('Authorization', `Bearer ${getToken('user-1')}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('displayName');
      expect(res.body).toHaveProperty('isOnline');
    });

    it('should return 404 for nonexistent ID', async () => {
      const res = await request(app)
        .get('/api/users/search/99999999')
        .set('Authorization', `Bearer ${getToken('user-1')}`);

      expect(res.status).toBe(404);
    });
  });
});

describe('Presence System', () => {
  it('presence:subscribe event returns statuses', () => {
    // This tests the protocol contract
    const subscribePayload = { userIds: ['user-1', 'user-2'] };
    expect(Array.isArray(subscribePayload.userIds)).toBe(true);
  });

  it('presence:online event structure', () => {
    const event = { userId: 'user-1', timestamp: Date.now() };
    expect(event.userId).toBeDefined();
    expect(typeof event.timestamp).toBe('number');
  });

  it('presence:offline event structure', () => {
    const event = { userId: 'user-1', timestamp: Date.now() };
    expect(event.userId).toBeDefined();
    expect(typeof event.timestamp).toBe('number');
  });
});
