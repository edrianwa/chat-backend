export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
}

export class HealthService {
  getStatus(): HealthStatus {
    return {
      status: 'ok',
      service: 'securechat-server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
