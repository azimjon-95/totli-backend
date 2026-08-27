import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AnalyticsService } from './analytics.service.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';
import { requireAdminAuth, requirePermission, requireCustomerAuth } from '../../middleware/auth.js';
import { ANALYTICS_EVENTS } from './analytics.model.js';

const trackSchema = z.object({
  event: z.enum(ANALYTICS_EVENTS as unknown as [string, ...string[]]),
  sessionId: z.string().max(64).optional(),
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  orderId: z.string().optional(),
  source: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const router = Router();

// Public/customer track (optional auth — attaches userId if present)
router.post('/track', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid event', parsed.error.flatten());

    // Optional customer from Bearer if present
    let userId: string | undefined;
    try {
      // soft: if middleware already set customerId
      userId = (req as Request & { customerId?: string }).customerId;
    } catch {
      /* ignore */
    }

    const data = await AnalyticsService.track({
      ...parsed.data,
      userId,
    });
    return sendSuccess(res, data, 201);
  } catch (e) {
    next(e);
  }
});

// Authenticated track with userId
router.post(
  '/track/me',
  requireCustomerAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = trackSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid event', parsed.error.flatten());
      const userId = (req as Request & { customerId: string }).customerId;
      const data = await AnalyticsService.track({ ...parsed.data, userId });
      return sendSuccess(res, data, 201);
    } catch (e) {
      next(e);
    }
  }
);

const adminRouter = Router();
adminRouter.use(requireAdminAuth);
adminRouter.get('/funnel', requirePermission('statistics:read'), async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const data = await AnalyticsService.funnel(days);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
});

export { router as analyticsPublicRoutes, adminRouter as analyticsAdminRoutes };
