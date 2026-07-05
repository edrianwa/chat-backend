import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import db from '../db/connection';

const notificationsRouter = Router();
notificationsRouter.use(authGuard);

/**
 * POST /notifications/register-token — Register/update FCM token.
 */
notificationsRouter.post('/register-token', async (req: Request, res: Response) => {
  try {
    const { token, deviceId } = req.body;
    if (!token || !deviceId) {
      res.status(400).json({ error: 'token and deviceId are required' });
      return;
    }

    await NotificationService.registerToken(req.user!.userId, token, deviceId);
    res.json({ message: 'Token registered' });
  } catch (err) {
    console.error('[Notifications] Register token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /notifications/token — Unregister FCM token (on logout).
 */
notificationsRouter.delete('/token', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    await NotificationService.removeToken(req.user!.userId, deviceId);
    res.json({ message: 'Token removed' });
  } catch (err) {
    console.error('[Notifications] Remove token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /messages/:id/encrypted — Get encrypted message ciphertext.
 * Used by client to decrypt for notification preview.
 */
notificationsRouter.get('/messages/:id/encrypted', async (req: Request, res: Response) => {
  try {
    // Look up in offline queue or message store
    const message = await db('offline_message_queue')
      .where('message_id', req.params.id)
      .first();

    if (message) {
      res.json({
        messageId: message.message_id,
        senderId: message.sender_id,
        ciphertext: message.ciphertext,
        sequenceNumber: message.sequence_number,
        timestamp: message.timestamp,
      });
      return;
    }

    // Not found — might already be delivered
    res.status(404).json({ error: 'Message not found or already delivered' });
  } catch (err) {
    console.error('[Notifications] Get encrypted error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { notificationsRouter };
