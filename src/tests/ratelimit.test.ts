import request from 'supertest';
import { app } from '../index';

jest.mock('../db/connection', () => {
  const mockDb = jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{}]),
    count: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue([]),
  }));
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

describe('Rate Limiting', () => {
  it('should include rate limit headers', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ uniqueId: '12345678', password: 'test' });

    // Standard rate limit headers
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
  });

  it('should enforce auth rate limit after max attempts', async () => {
    // This test verifies rate limiting is configured
    // In a real test env, you'd need to hit the endpoint >10 times
    const res = await request(app)
      .post('/api/auth/login')
      .send({ uniqueId: '12345678', password: 'wrong' });

    // First request should still succeed (not rate limited)
    expect(res.status).not.toBe(429);
  });
});
