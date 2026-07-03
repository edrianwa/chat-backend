import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { UserService } from '../services/user.service';
import { PresenceService } from '../services/presence.service';
import db from '../db/connection';

const usersRouter = Router();

// All user routes require authentication
usersRouter.use(authGuard);

/**
 * GET /users/me/profile — Get own profile.
 */
usersRouter.get('/me/profile', async (req: Request, res: Response) => {
  try {
    const user = await UserService.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      uniqueId: user.unique_id_number,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      about: (user as any).about || '',
      role: user.role,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('[Users] Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /users/me/profile — Update own profile.
 */
usersRouter.patch('/me/profile', async (req: Request, res: Response) => {
  try {
    const { displayName, avatarUrl, about } = req.body;
    const updates: Record<string, any> = { updated_at: new Date() };

    if (displayName !== undefined) {
      if (displayName.length < 2 || displayName.length > 64) {
        res.status(400).json({ error: 'Display name must be 2-64 characters' });
        return;
      }
      updates.display_name = displayName;
    }
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
    if (about !== undefined) {
      if (about.length > 256) {
        res.status(400).json({ error: 'About must be under 256 characters' });
        return;
      }
      updates.about = about;
    }

    await db('users').where('id', req.user!.userId).update(updates);

    const user = await UserService.findById(req.user!.userId);
    res.json({
      id: user!.id,
      uniqueId: user!.unique_id_number,
      displayName: user!.display_name,
      avatarUrl: user!.avatar_url,
      about: (user as any)?.about || '',
    });
  } catch (err) {
    console.error('[Users] Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /users/:id/profile — Get another user's profile.
 */
usersRouter.get('/:id/profile', async (req: Request, res: Response) => {
  try {
    const user = await UserService.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isOnline = await PresenceService.isOnline(user.id);
    const lastSeen = isOnline ? null : await PresenceService.getLastSeen(user.id);

    res.json({
      id: user.id,
      uniqueId: user.unique_id_number,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      about: (user as any).about || '',
      isOnline,
      lastSeen,
    });
  } catch (err) {
    console.error('[Users] Get user profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /users/search/:idNumber — Search user by unique ID number.
 */
usersRouter.get('/search/:idNumber', async (req: Request, res: Response) => {
  try {
    const user = await UserService.findByUniqueId(req.params.idNumber);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Don't return yourself
    if (user.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot search for yourself' });
      return;
    }

    const isOnline = await PresenceService.isOnline(user.id);

    res.json({
      id: user.id,
      uniqueId: user.unique_id_number,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isOnline,
    });
  } catch (err) {
    console.error('[Users] Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { usersRouter };
