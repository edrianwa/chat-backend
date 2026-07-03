import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { Express } from 'express';

/**
 * Apply security middleware to the Express app.
 */
export function applySecurity(app: Express): void {
  // Helmet — security headers
  app.use(helmet());

  // CORS
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // General rate limit
  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

/**
 * Stricter rate limit for auth endpoints.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: config.rateLimit.authMax,
  message: { error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
