import { Router, Request, Response } from 'express';
import { HealthController } from '../controllers/health.controller';

const healthRouter = Router();
const healthController = new HealthController();

healthRouter.get('/', (req: Request, res: Response) => {
  healthController.check(req, res);
});

export { healthRouter };
