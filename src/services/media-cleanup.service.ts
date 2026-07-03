import { MediaService } from './media.service';

/**
 * Auto-delete scheduler for expired media.
 * In production: triggered by Cloud Scheduler via HTTP endpoint or cron.
 * In development: runs as a setInterval timer.
 */
export class MediaCleanupService {
  private static intervalId: NodeJS.Timeout | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Start the cleanup scheduler.
   */
  static start(): void {
    console.log('[MediaCleanup] Starting auto-delete scheduler (hourly)');
    // Run immediately on start
    this.runCleanup();
    // Then schedule hourly
    this.intervalId = setInterval(() => this.runCleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup scheduler.
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MediaCleanup] Stopped auto-delete scheduler');
    }
  }

  /**
   * Run a single cleanup cycle.
   */
  static async runCleanup(): Promise<number> {
    try {
      const deleted = await MediaService.deleteExpiredMedia();
      if (deleted > 0) {
        console.log(`[MediaCleanup] Deleted ${deleted} expired media items`);
      }
      return deleted;
    } catch (err) {
      console.error('[MediaCleanup] Error during cleanup:', err);
      return 0;
    }
  }
}
