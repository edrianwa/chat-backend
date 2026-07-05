import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import { AuthService } from '../services/auth.service';
import db from '../db/connection';

const deviceRouter = Router();
deviceRouter.use(authGuard);

/**
 * DELETE /users/me/device — Panic wipe: deregister device.
 * Removes FCM token, marks device as wiped. Does NOT delete account.
 */
deviceRouter.delete('/me/device', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId required' });
      return;
    }

    // Remove FCM token for this device
    await NotificationService.removeToken(req.user!.userId, deviceId);

    // Revoke this device's session
    await AuthService.revokeRefreshToken(req.user!.userId);

    res.json({ message: 'Device wiped and deregistered' });
  } catch (err) {
    console.error('[Device] Wipe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { deviceRouter };
