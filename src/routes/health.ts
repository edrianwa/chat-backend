import { Router, Request, Response } from "express";

const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "securechat-server",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export { healthRouter };
