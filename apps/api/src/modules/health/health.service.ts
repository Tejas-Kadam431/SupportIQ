export interface HealthService {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
}

export function getHealthService(): HealthService {
  return {
    status: 'ok',
    service: 'resolveflow-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  };
}