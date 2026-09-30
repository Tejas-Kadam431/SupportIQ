import { Router } from "express";
import getHealth from "./health.controller.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { readiness } from "./readiness.js";
const router = Router();
router.get("/live", asyncHandler(getHealth));
router.get("/ready", asyncHandler(async (_req, res) => { const result = await readiness(); res.status(result.ready ? 200 : 503).json(result); }));
router.get("/", asyncHandler(getHealth));
export const healthRoutes = router;
