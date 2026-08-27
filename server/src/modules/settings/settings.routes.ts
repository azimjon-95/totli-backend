import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SettingsService } from './settings.service.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';
import { requireAdminAuth, requirePermission } from '../../middleware/auth.js';

const bannerSchema = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(300).optional(),
  imageUrl: z.string().max(500).optional(),
  ctaText: z.string().max(60).optional(),
  ctaLink: z.string().max(120).optional(),
});

const publicRouter = Router();
publicRouter.get('/banner', async (_req, res, next) => {
  try {
    const data = await SettingsService.getBanner();
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
});

const adminRouter = Router();
adminRouter.use(requireAdminAuth);

adminRouter.get('/banner', requirePermission('settings:write'), async (_req, res, next) => {
  try {
    const data = await SettingsService.getBanner();
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/banner', requirePermission('settings:write'), async (req, res, next) => {
  try {
    const parsed = bannerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid banner', parsed.error.flatten());
    const data = await SettingsService.setBanner(parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
});

export { publicRouter as settingsPublicRoutes, adminRouter as settingsAdminRoutes };
