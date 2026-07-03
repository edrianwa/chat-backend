import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth.middleware';
import { MediaService } from '../services/media.service';

const mediaRouter = Router();

// All media routes require authentication
mediaRouter.use(authGuard);

/**
 * POST /media/upload
 * Upload an encrypted media file.
 * Accepts raw binary body with metadata in headers.
 */
mediaRouter.post('/upload', async (req: Request, res: Response) => {
  try {
    const chatId = req.headers['x-chat-id'] as string;
    const fileName = req.headers['x-file-name'] as string || 'media.bin';
    const mimeType = req.headers['content-type'] || 'application/octet-stream';

    if (!chatId) {
      res.status(400).json({ error: 'x-chat-id header is required' });
      return;
    }

    // Collect body buffer
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve) => req.on('end', resolve));
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      res.status(400).json({ error: 'Empty file body' });
      return;
    }

    // Check file size (16MB max)
    const MAX_FILE_SIZE = 16 * 1024 * 1024;
    if (fileBuffer.length > MAX_FILE_SIZE) {
      res.status(413).json({ error: 'File too large. Maximum 16MB.' });
      return;
    }

    // Check quota
    const quota = await MediaService.checkQuota(req.user!.userId, fileBuffer.length);
    if (!quota.allowed) {
      res.status(507).json({
        error: 'Storage quota exceeded',
        used: quota.used,
        max: quota.max,
      });
      return;
    }

    // Upload
    const metadata = await MediaService.uploadMedia({
      uploaderId: req.user!.userId,
      chatId,
      fileName,
      fileSize: fileBuffer.length,
      mimeType,
      fileBuffer,
    });

    res.status(201).json({
      id: metadata.id,
      url: `/api/media/${metadata.id}`,
      fileSize: metadata.file_size,
      mimeType: metadata.mime_type,
      expiresAt: metadata.expires_at,
    });
  } catch (err) {
    console.error('[Media] Upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /media/:id
 * Download an encrypted media file.
 */
mediaRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const media = await MediaService.getMedia(req.params.id);
    if (!media) {
      res.status(404).json({ error: 'Media not found or deleted' });
      return;
    }

    const file = await MediaService.getMediaFile(media.storage_path);
    if (!file) {
      res.status(404).json({ error: 'Media file not found on storage' });
      return;
    }

    res.setHeader('Content-Type', media.mime_type);
    res.setHeader('Content-Length', file.length.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${media.file_name}"`);
    res.setHeader('X-Media-Id', media.id);
    res.send(file);
  } catch (err) {
    console.error('[Media] Download error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /media/:id
 * Delete a media item (sender only).
 */
mediaRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await MediaService.deleteMedia(req.params.id, req.user!.userId);
    if (!deleted) {
      res.status(404).json({ error: 'Media not found or not owned by you' });
      return;
    }
    res.json({ message: 'Media deleted' });
  } catch (err) {
    console.error('[Media] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /media/quota/me
 * Get current user's storage quota info.
 */
mediaRouter.get('/quota/me', async (req: Request, res: Response) => {
  try {
    const quota = await MediaService.checkQuota(req.user!.userId, 0);
    res.json(quota);
  } catch (err) {
    console.error('[Media] Quota error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /media/settings/:chatId
 * Set per-chat media TTL.
 */
mediaRouter.put('/settings/:chatId', async (req: Request, res: Response) => {
  try {
    const { ttlDays } = req.body;
    const validTtl = [null, 1, 7, 30, 90];
    if (!validTtl.includes(ttlDays)) {
      res.status(400).json({ error: 'ttlDays must be null, 1, 7, 30, or 90' });
      return;
    }

    await MediaService.setChatTTL(req.user!.userId, req.params.chatId, ttlDays);
    res.json({ chatId: req.params.chatId, ttlDays });
  } catch (err) {
    console.error('[Media] Settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /media/settings/:chatId
 * Get per-chat media TTL.
 */
mediaRouter.get('/settings/:chatId', async (req: Request, res: Response) => {
  try {
    const ttl = await MediaService.getChatTTL(req.user!.userId, req.params.chatId);
    res.json({ chatId: req.params.chatId, ttlDays: ttl });
  } catch (err) {
    console.error('[Media] Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { mediaRouter };
