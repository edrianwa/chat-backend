import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { CallService } from '../services/call.service';

const callsRouter = Router();

callsRouter.use(authGuard);

/**
 * GET /calls/turn-credentials
 * Generate temporary TURN server credentials for WebRTC.
 */
callsRouter.get('/turn-credentials', async (req: Request, res: Response) => {
  try {
    const credentials = CallService.generateTurnCredentials(req.user!.userId);
    res.json(credentials);
  } catch (err) {
    console.error('[Calls] TURN credentials error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /calls/history
 * Get call history for the authenticated user.
 */
callsRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const history = await CallService.getCallHistory(req.user!.userId);
    res.json({ calls: history });
  } catch (err) {
    console.error('[Calls] History error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { callsRouter };
