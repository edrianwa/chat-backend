import { Router, Request, Response } from 'express';
import { authGuard, adminGuard } from '../middleware/auth.middleware';
import { InviteService } from '../services/invite.service';
import { UserService } from '../services/user.service';
import { AdminService } from '../services/admin.service';

const adminRouter = Router();

// All admin routes require auth + admin role
adminRouter.use(authGuard, adminGuard);

/**
 * POST /admin/invites
 * Generate a new invite code.
 */
adminRouter.post('/invites', async (req: Request, res: Response) => {
  try {
    const { expiresInHours } = req.body;
    const invite = await InviteService.createInvite(
      req.user!.userId,
      expiresInHours ? parseInt(expiresInHours, 10) : undefined
    );
    res.status(201).json(invite);
  } catch (err) {
    console.error('[Admin] Create invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/invites
 * List all invite codes.
 */
adminRouter.get('/invites', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const invites = await InviteService.listInvites(page);
    res.json({ invites });
  } catch (err) {
    console.error('[Admin] List invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/users
 * List all registered users.
 */
adminRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const result = await UserService.listUsers(page);
    res.json(result);
  } catch (err) {
    console.error('[Admin] List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/users/:id
 * Update user status (approve/revoke/ban).
 */
adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'suspended', 'banned'].includes(status)) {
      res.status(400).json({ error: 'status must be: active, suspended, or banned' });
      return;
    }

    const user = await UserService.updateStatus(id, status);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      uniqueId: user.unique_id_number,
      displayName: user.display_name,
      status: user.status,
    });
  } catch (err) {
    console.error('[Admin] Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/settings
 * Get all admin settings.
 */
adminRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await AdminService.getAllSettings();
    res.json(settings);
  } catch (err) {
    console.error('[Admin] Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/settings
 * Update admin settings (e.g., user_cap).
 */
adminRouter.patch('/settings', async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'Request body must be an object of key-value pairs' });
      return;
    }

    for (const [key, value] of Object.entries(updates)) {
      await AdminService.updateSetting(key, String(value));
    }

    const settings = await AdminService.getAllSettings();
    res.json(settings);
  } catch (err) {
    console.error('[Admin] Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { adminRouter };
