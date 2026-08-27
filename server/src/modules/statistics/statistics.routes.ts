import { Router } from 'express';
import { dashboard, overview } from './statistics.controller.js';
import { requireAdminAuth, requirePermission } from '../../middleware/auth.js';

const router = Router();
router.use(requireAdminAuth);
router.get('/dashboard', requirePermission('statistics:read'), dashboard);
router.get('/overview', requirePermission('statistics:read'), overview);

export default router;
