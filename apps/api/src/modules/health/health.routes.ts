import { Router } from 'express';
import { getHealth } from './health.controller.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(getHealth));

export const healthRoutes = router;