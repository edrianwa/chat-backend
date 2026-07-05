import { Router, Request, Response } from 'express';
import { authGuard, adminGuard } from '../middleware/auth.middleware';
import { getRedis } from '../db/redis';
import db from '../db/connection';

const adminExtRouter = Router();
adminExtRouter.use(authGuard, adminGuard);

/**
 * GET /admin/stats — Server statistics.
 */
adminExtRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const [userCount] = await db('users').count('* as count');
    const [activeToday] = await db('users')
      .where('last_seen', '>', new Date(Date.now() - 86400000))
      .count('* as count');
    const [messageCount] = await db('message_metadata').count('* as count');
    const [mediaCount] = await db('media_metadata')
      .where('is_deleted', false)
      .count('* as count');
    const [storageResult] = await db('storage_quota').sum('used_bytes as total');
    const [inviteCount] = await db('invites').count('* as count');

    res.json({
      totalUsers: parseInt(userCount.count as string, 10) || 0,
      activeToday: parseInt(activeToday.count as string, 10) || 0,
      totalMessages: parseInt(messageCount.count as string, 10) || 0,
      totalMedia: parseInt(mediaCount.count as string, 10) || 0,
      storageUsedBytes: parseInt(storageResult.total as string, 10) || 0,
      totalInvites: parseInt(inviteCount.count as string, 10) || 0,
    });
  } catch (err) {
    console.error('[Admin] Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/invites/batch — Generate multiple invite codes at once.
 */
adminExtRouter.post('/invites/batch', async (req: Request, res: Response) => {
  try {
    const { count, expiresInHours } = req.body;
    const num = Math.min(parseInt(count, 10) || 1, 50); // Max 50 at once
    const { v4: uuidv4 } = require('uuid');

    const codes: any[] = [];
    for (let i = 0; i < num; i++) {
      const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 3600000)
        : null;

      const [invite] = await db('invites')
        .insert({ code, created_by: req.user!.userId, expires_at: expiresAt })
        .returning('*');
      codes.push(invite);
    }

    res.status(201).json({ invites: codes, count: codes.length });
  } catch (err) {
    console.error('[Admin] Batch invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/force-logout — Invalidate all sessions (flush Redis).
 */
adminExtRouter.post('/force-logout', async (req: Request, res: Response) => {
  try {
    const redis = getRedis();
    // Delete all refresh tokens
    const keys = await redis.keys('refresh:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    res.json({ message: `Logged out all users. ${keys.length} sessions invalidated.` });
  } catch (err) {
    console.error('[Admin] Force logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/wipe-media — Delete all media from storage.
 * Requires confirmation token in body.
 */
adminExtRouter.post('/wipe-media', async (req: Request, res: Response) => {
  try {
    const { confirmToken } = req.body;
    if (confirmToken !== 'CONFIRM_WIPE_ALL_MEDIA') {
      res.status(400).json({ error: 'Must send confirmToken: CONFIRM_WIPE_ALL_MEDIA' });
      return;
    }

    // Mark all media as deleted
    const result = await db('media_metadata')
      .where('is_deleted', false)
      .update({ is_deleted: true, deleted_at: new Date() });

    // Reset all quotas
    await db('storage_quota').update({ used_bytes: 0 });

    res.json({ message: `Wiped ${result} media items.` });
  } catch (err) {
    console.error('[Admin] Wipe media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/users/:id/role — Promote/demote user role.
 */
adminExtRouter.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      res.status(400).json({ error: 'role must be user or admin' }); return;
    }
    const [user] = await db('users')
      .where('id', req.params.id)
      .update({ role, updated_at: new Date() })
      .returning(['id', 'unique_id_number', 'display_name', 'role', 'status']);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (err) {
    console.error('[Admin] Update role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { adminExtRouter };
