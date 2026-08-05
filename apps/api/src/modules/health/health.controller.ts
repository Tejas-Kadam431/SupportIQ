import type { Request, Response} from 'express';
import { getHealthService } from './health.service.js';

export async function getHealth(req: Request, res: Response): Promise<void> {
  const healthData = getHealthService();

  res.status(200).json({
    data: healthData,
  });
}