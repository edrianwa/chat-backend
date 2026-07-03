import request from 'supertest';
import { app } from '../index';

// Mock DB and Redis for health test (not needed but prevents connection errors)
jest.mock('../db/connection', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

jest.mock('../db/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  })),
  closeRedis: jest.fn(),
}));

describe('Health Check', () => {
  it('GET /api/health should return 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('securechat-server');
  });

  it('should include uptime and version', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.version).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});
