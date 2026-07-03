import jwt, { JwtPayload } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { getRedis } from "../db/redis";

export interface TokenPayload {
  userId: string;
  role: string;
  uniqueId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Generate a JWT access token and refresh token pair.
   */
  static generateTokens(payload: TokenPayload): TokenPair {
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string | number,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(
      { userId: payload.userId, tokenId: uuidv4() },
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshExpiresIn as string | number,
      } as jwt.SignOptions,
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify an access token and return the payload.
   */
  static verifyAccessToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Verify a refresh token.
   */
  static verifyRefreshToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Store a refresh token in Redis with expiry.
   */
  static async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const redis = getRedis();
    const key = `refresh:${userId}`;
    // Store with 7-day TTL
    await redis.set(key, refreshToken, "EX", 7 * 24 * 60 * 60);
  }

  /**
   * Validate a stored refresh token matches what we have.
   */
  static async validateStoredRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const redis = getRedis();
    const key = `refresh:${userId}`;
    const stored = await redis.get(key);
    return stored === refreshToken;
  }

  /**
   * Revoke refresh token (logout).
   */
  static async revokeRefreshToken(userId: string): Promise<void> {
    const redis = getRedis();
    const key = `refresh:${userId}`;
    await redis.del(key);
  }

  /**
   * Blacklist an access token (for forced logout/ban).
   */
  static async blacklistToken(
    token: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const redis = getRedis();
    await redis.set(`blacklist:${token}`, "1", "EX", expiresInSeconds);
  }

  /**
   * Check if a token is blacklisted.
   */
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    const redis = getRedis();
    const result = await redis.get(`blacklist:${token}`);
    return result !== null;
  }
}
