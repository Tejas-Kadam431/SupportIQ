export interface HealthData {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
}

export function HealthService(): HealthData {
  return {
    status: "ok",
    service: "ResolveFlow-api",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
  };
}