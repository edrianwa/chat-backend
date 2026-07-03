import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { KeyService } from '../services/key.service';

const keysRouter = Router();

// All key routes require authentication
keysRouter.use(authGuard);

/**
 * POST /keys/bundle
 * Upload a full key bundle (on registration or key reset).
 */
keysRouter.post('/bundle', async (req: Request, res: Response) => {
  try {
    const { identityKey, registrationId, signedPreKey, oneTimePreKeys } = req.body;

    // Validate required fields
    if (!identityKey || !registrationId || !signedPreKey) {
      res.status(400).json({ error: 'identityKey, registrationId, and signedPreKey are required' });
      return;
    }

    if (!signedPreKey.keyId || !signedPreKey.publicKey || !signedPreKey.signature) {
      res.status(400).json({ error: 'signedPreKey must include keyId, publicKey, and signature' });
      return;
    }

    if (!Array.isArray(oneTimePreKeys)) {
      res.status(400).json({ error: 'oneTimePreKeys must be an array' });
      return;
    }

    await KeyService.uploadBundle(req.user!.userId, {
      identityKey,
      registrationId,
      signedPreKey,
      oneTimePreKeys: oneTimePreKeys || [],
    });

    res.status(201).json({ message: 'Key bundle uploaded successfully' });
  } catch (err) {
    console.error('[Keys] Upload bundle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /keys/bundle/:userId
 * Fetch a user's key bundle (consumes one one-time pre-key).
 */
keysRouter.get('/bundle/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const bundle = await KeyService.fetchBundle(userId);
    if (!bundle) {
      res.status(404).json({ error: 'Key bundle not found for this user' });
      return;
    }

    // Check if the target user's pre-key count is low and notify via socket
    const isLow = await KeyService.isPreKeyCountLow(userId);
    if (isLow) {
      // Emit notification to the key owner
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit('pre_keys_low', {
          remaining: await KeyService.getPreKeyCount(userId),
          threshold: KeyService.LOW_KEY_THRESHOLD,
        });
      }
    }

    res.json(bundle);
  } catch (err) {
    console.error('[Keys] Fetch bundle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /keys/count
 * Get the number of remaining unused one-time pre-keys for the authenticated user.
 */
keysRouter.get('/count', async (req: Request, res: Response) => {
  try {
    const count = await KeyService.getPreKeyCount(req.user!.userId);
    res.json({ count, threshold: KeyService.LOW_KEY_THRESHOLD });
  } catch (err) {
    console.error('[Keys] Get count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /keys/replenish
 * Upload additional one-time pre-keys when count is low.
 */
keysRouter.post('/replenish', async (req: Request, res: Response) => {
  try {
    const { preKeys } = req.body;

    if (!Array.isArray(preKeys) || preKeys.length === 0) {
      res.status(400).json({ error: 'preKeys must be a non-empty array of { keyId, publicKey }' });
      return;
    }

    // Validate each key
    for (const key of preKeys) {
      if (!key.keyId || !key.publicKey) {
        res.status(400).json({ error: 'Each pre-key must have keyId and publicKey' });
        return;
      }
    }

    const added = await KeyService.replenishPreKeys(req.user!.userId, preKeys);
    const newCount = await KeyService.getPreKeyCount(req.user!.userId);

    res.status(201).json({
      message: `Added ${added} pre-keys`,
      count: newCount,
    });
  } catch (err) {
    console.error('[Keys] Replenish error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { keysRouter };
