import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import db from '../db/connection';

const settingsRouter = Router();
settingsRouter.use(authGuard);

/**
 * GET /users/me/settings — Get privacy & app settings.
 */
settingsRouter.get('/me/settings', async (req: Request, res: Response) => {
  try {
    const user = await db('users')
      .where('id', req.user!.userId)
      .select('last_seen_visibility', 'read_receipts_enabled', 'profile_photo_visibility')
      .first();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (err) {
    console.error('[Settings] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /users/me/settings — Update privacy settings.
 */
settingsRouter.patch('/me/settings', async (req: Request, res: Response) => {
  try {
    const { lastSeenVisibility, readReceiptsEnabled, profilePhotoVisibility } = req.body;
    const updates: Record<string, any> = { updated_at: new Date() };

    const validVisibility = ['everyone', 'contacts', 'nobody'];
    if (lastSeenVisibility !== undefined) {
      if (!validVisibility.includes(lastSeenVisibility)) {
        res.status(400).json({ error: 'Invalid lastSeenVisibility' }); return;
      }
      updates.last_seen_visibility = lastSeenVisibility;
    }
    if (readReceiptsEnabled !== undefined) {
      updates.read_receipts_enabled = !!readReceiptsEnabled;
    }
    if (profilePhotoVisibility !== undefined) {
      if (!validVisibility.includes(profilePhotoVisibility)) {
        res.status(400).json({ error: 'Invalid profilePhotoVisibility' }); return;
      }
      updates.profile_photo_visibility = profilePhotoVisibility;
    }

    await db('users').where('id', req.user!.userId).update(updates);
    const updated = await db('users')
      .where('id', req.user!.userId)
      .select('last_seen_visibility', 'read_receipts_enabled', 'profile_photo_visibility')
      .first();
    res.json(updated);
  } catch (err) {
    console.error('[Settings] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /users/me/chat-settings/:chatId — Update per-chat settings.
 */
settingsRouter.patch('/me/chat-settings/:chatId', async (req: Request, res: Response) => {
  try {
    const { retentionDays, muted } = req.body;
    const updates: Record<string, any> = { updated_at: new Date() };

    if (retentionDays !== undefined) {
      const validDays = [null, 1, 7, 30, 90];
      if (!validDays.includes(retentionDays)) {
        res.status(400).json({ error: 'retentionDays must be null, 1, 7, 30, or 90' }); return;
      }
      updates.media_ttl_days = retentionDays;
    }
    if (muted !== undefined) updates.muted = !!muted;

    await db('chat_settings')
      .insert({
        user_id: req.user!.userId,
        chat_id: req.params.chatId,
        ...updates,
      })
      .onConflict(['user_id', 'chat_id'])
      .merge(updates);

    res.json({ chatId: req.params.chatId, ...updates });
  } catch (err) {
    console.error('[Settings] Chat settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /users/me — Delete account.
 * Cascades: removes user data, key bundles, sessions, messages metadata.
 */
settingsRouter.delete('/me', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password required for account deletion' }); return;
    }

    const user = await db('users').where('id', req.user!.userId).first();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Verify password (device ID in our case)
    const bcrypt = require('bcrypt');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { res.status(401).json({ error: 'Invalid password' }); return; }

    // Cascade delete (foreign keys handle most)
    await db('users').where('id', req.user!.userId).del();

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('[Settings] Delete account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { settingsRouter };
