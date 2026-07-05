import { Request, Response, NextFunction, Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { getRedis } from '../db/redis';
import db from '../db/connection';

/**
 * Apply hardened security middleware.
 */
export function applyHardenedSecurity(app: Express): void {
  // Helmet with strict CSP
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));

  // CORS — restrict to known origins
  app.use(cors({
    origin: config.nodeEnv === 'production'
      ? ['https://securechat.example.com']
      : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-chat-id', 'x-file-name'],
    maxAge: 86400,
  }));

  // Reject oversized payloads (16MB max for media, 1MB for JSON)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (req.path.includes('/media/upload')) {
      if (contentLength > 16 * 1024 * 1024) {
        res.status(413).json({ error: 'Payload too large' });
        return;
      }
    } else {
      if (contentLength > 1024 * 1024) {
        res.status(413).json({ error: 'Payload too large' });
        return;
      }
    }
    next();
  });

  // General rate limit
  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Request logging (no message content)
  app.use(requestLogger);
}

/**
 * Stricter rate limits for specific routes.
 */
export const authRateLimitStrict = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute per IP
  message: { error: 'Too many auth attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Registration limit reached. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const messageSendRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 messages per minute
  message: { error: 'Message rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip || 'unknown',
});

export const mediaUploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Upload rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip || 'unknown',
});

/**
 * Brute force protection: lock account after 10 failed login attempts.
 */
export async function checkBruteForce(uniqueId: string): Promise<{ locked: boolean; attemptsLeft: number }> {
  const redis = getRedis();
  const key = `bruteforce:${uniqueId}`;
  const attempts = parseInt(await redis.get(key) || '0', 10);

  if (attempts >= 10) {
    return { locked: true, attemptsLeft: 0 };
  }
  return { locked: false, attemptsLeft: 10 - attempts };
}

export async function recordFailedLogin(uniqueId: string): Promise<void> {
  const redis = getRedis();
  const key = `bruteforce:${uniqueId}`;
  await redis.incr(key);
  await redis.expire(key, 1800); // 30-minute cooldown
}

export async function clearBruteForce(uniqueId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`bruteforce:${uniqueId}`);
}

/**
 * Concurrent session limit (max 3 devices per user).
 */
export async function checkSessionLimit(userId: string): Promise<boolean> {
  const tokens = await db('fcm_tokens').where('user_id', userId).count('* as count').first();
  const count = parseInt(tokens?.count as string, 10) || 0;
  return count < 3;
}

/**
 * Request logger — logs access without message content.
 */
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: (req as any).user?.userId || 'anonymous',
    };
    // In production: write to structured log file
    if (config.nodeEnv !== 'test') {
      console.log(`[Access] ${logEntry.method} ${logEntry.path} ${logEntry.status} ${logEntry.duration} user=${logEntry.userId}`);
    }
  });
  next();
}

/**
 * Input sanitization helper.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Strip HTML tags
    .replace(/[\x00-\x1F\x7F]/g, '') // Strip control characters
    .trim();
}

/**
 * Enhanced health check with dependency checks.
 */
export async function healthCheckDetailed(): Promise<{
  status: string;
  db: boolean;
  redis: boolean;
  uptime: number;
}> {
  let dbOk = false;
  let redisOk = false;

  try {
    await db.raw('SELECT 1');
    dbOk = true;
  } catch (_) {}

  try {
    const redis = getRedis();
    await redis.ping();
    redisOk = true;
  } catch (_) {}

  return {
    status: dbOk && redisOk ? 'ok' : 'degraded',
    db: dbOk,
    redis: redisOk,
    uptime: process.uptime(),
  };
}
