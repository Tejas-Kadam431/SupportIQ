import type {Request, Response} from "express";
import {HealthService} from "./health.service.js";

export default async function getHealth(req: Request, res: Response): Promise<void> {
  const healthdata = HealthService();
  res.status(200).json(
    {
      data: healthdata,
    }
  );
}
