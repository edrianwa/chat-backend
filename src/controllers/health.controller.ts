import { Request, Response } from 'express';
import { HealthService } from '../services/health.service';

export class HealthController {
  private healthService: HealthService;

  constructor() {
    this.healthService = new HealthService();
  }

  check(_req: Request, res: Response): void {
    const status = this.healthService.getStatus();
    res.status(200).json(status);
  }
}
