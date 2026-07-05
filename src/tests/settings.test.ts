import request from 'supertest';
import { app } from '../index';
import { AuthService } from '../services/auth.service';

jest.mock('../db/connection', () => {
  const users: Record<string, any> = {
    'admin-1': { id: 'admin-1', role: 'admin', last_seen_visibility: 'everyone', read_receipts_enabled: true, profile_photo_visibility: 'everyone', password_hash: '$2b$12$test' },
    'user-1': { id: 'user-1', role: 'user', last_seen_visibility: 'everyone', read_receipts_enabled: true, profile_photo_visibility: 'everyone', password_hash: '$2b$12$test' },
  };
  const mockDb = jest.fn((tableName: string) => {
    const createQb = (): any => {
      const qb: any = {};
      let filters: Record<string, any> = {};
      qb.where = jest.fn().mockImplementation((k: string, v?: any) => { if (v !== undefined) filters[k] = v; return qb; });
      qb.first = jest.fn().mockImplementation(() => {
        if (tableName === 'users' && filters.id) return users[filters.id] || null;
        return null;
      });
      qb.select = jest.fn().mockImplementation(() => {
        if (tableName === 'users' && filters.id) {
          const u = users[filters.id];
          if (u) return { ...qb, first: jest.fn().mockResolvedValue(u) };
        }
        return qb;
      });
      qb.update = jest.fn().mockResolvedValue(1);
      qb.insert = jest.fn().mockReturnValue(qb);
      qb.returning = jest.fn().mockResolvedValue([{}]);
      qb.count = jest.fn().mockReturnValue(qb);
      qb.sum = jest.fn().mockReturnValue([{ total: '0' }]);
      qb.del = jest.fn().mockResolvedValue(1);
      qb.onConflict = jest.fn().mockReturnValue(qb);
      qb.merge = jest.fn().mockResolvedValue(undefined);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockResolvedValue([]);
      qb.keys = jest.fn().mockResolvedValue([]);
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
    keys: jest.fn().mockResolvedValue(['refresh:1', 'refresh:2']),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
  })),
  closeRedis: jest.fn(),
}));

function adminToken(): string {
  return AuthService.generateTokens({ userId: 'admin-1', role: 'admin', uniqueId: '00000001' }).accessToken;
}
function userToken(): string {
  return AuthService.generateTokens({ userId: 'user-1', role: 'user', uniqueId: '12345678' }).accessToken;
}

describe('Admin Extended Endpoints', () => {
  it('GET /admin/stats requires admin', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/stats works for admin', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('POST /admin/force-logout requires admin', async () => {
    const res = await request(app).post('/api/admin/force-logout').set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(403);
  });

  it('POST /admin/force-logout works for admin', async () => {
    const res = await request(app).post('/api/admin/force-logout').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('sessions invalidated');
  });

  it('POST /admin/wipe-media requires confirmation token', async () => {
    const res = await request(app).post('/api/admin/wipe-media')
      .set('Authorization', `Bearer ${adminToken()}`).send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin/wipe-media works with correct token', async () => {
    const res = await request(app).post('/api/admin/wipe-media')
      .set('Authorization', `Bearer ${adminToken()}`).send({ confirmToken: 'CONFIRM_WIPE_ALL_MEDIA' });
    expect(res.status).toBe(200);
  });

  it('PATCH /admin/users/:id/role validates role', async () => {
    const res = await request(app).patch('/api/admin/users/user-1/role')
      .set('Authorization', `Bearer ${adminToken()}`).send({ role: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('User Settings Endpoints', () => {
  it('PATCH /users/me/settings updates privacy', async () => {
    const res = await request(app).patch('/api/users/me/settings')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ lastSeenVisibility: 'nobody', readReceiptsEnabled: false });
    expect(res.status).not.toBe(401);
  });

  it('PATCH /users/me/settings rejects invalid visibility', async () => {
    const res = await request(app).patch('/api/users/me/settings')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ lastSeenVisibility: 'invalid_value' });
    expect(res.status).toBe(400);
  });

  it('PATCH /users/me/chat-settings/:chatId sets retention', async () => {
    const res = await request(app).patch('/api/users/me/chat-settings/chat-1')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ retentionDays: 7 });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(400);
  });

  it('PATCH /users/me/chat-settings rejects invalid retention', async () => {
    const res = await request(app).patch('/api/users/me/chat-settings/chat-1')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ retentionDays: 5 });
    expect(res.status).toBe(400);
  });

  it('DELETE /users/me requires password', async () => {
    const res = await request(app).delete('/api/users/me')
      .set('Authorization', `Bearer ${userToken()}`).send({});
    expect(res.status).toBe(400);
  });
});
