import { AuthService } from '../services/auth.service';

// Mock Redis
jest.mock('../db/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  })),
  closeRedis: jest.fn(),
}));

jest.mock('../db/connection', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

describe('Socket.io Authentication', () => {
  it('should generate a valid token for socket auth', () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-socket-1',
      role: 'user',
      uniqueId: '55555555',
    });

    expect(tokens.accessToken).toBeDefined();

    // Verify the token would pass socket auth middleware
    const payload = AuthService.verifyAccessToken(tokens.accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user-socket-1');
  });

  it('should reject expired/invalid tokens', () => {
    const payload = AuthService.verifyAccessToken('expired.invalid.token');
    expect(payload).toBeNull();
  });

  it('should include correct payload fields for socket connection', () => {
    const tokens = AuthService.generateTokens({
      userId: 'user-abc',
      role: 'admin',
      uniqueId: '99887766',
    });

    const payload = AuthService.verifyAccessToken(tokens.accessToken);
    expect(payload).toHaveProperty('userId');
    expect(payload).toHaveProperty('role');
    expect(payload).toHaveProperty('uniqueId');
  });
});
