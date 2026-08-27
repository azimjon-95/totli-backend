import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentService } from './payment.service.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';
import { requireCustomerAuth } from '../../middleware/auth.js';
import { webhookRateLimit } from '../../middleware/rateLimits.js';

const createSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(['CLICK', 'PAYME', 'PAYNET', 'CASH']),
  idempotencyKey: z.string().max(64).optional(),
});

const router = Router();

router.get('/providers', (_req, res) => {
  return sendSuccess(res, PaymentService.getStatus());
});

router.post('/', requireCustomerAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid payment', parsed.error.flatten());
    const data = await PaymentService.createForOrder(parsed.data);
    return sendSuccess(res, data, 201);
  } catch (e) {
    next(e);
  }
});

router.post(
  '/:provider/webhook',
  webhookRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k] = Array.isArray(v) ? v[0] : v;
      }
      const data = await PaymentService.handleWebhook(
        req.params.provider as string,
        req.body,
        headers
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  }
);

export default router;
