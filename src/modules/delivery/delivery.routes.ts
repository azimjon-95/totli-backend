import { Router } from 'express';
import { z } from 'zod';
import { DeliveryService } from './delivery.service.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

const router = Router();

router.get('/zones', (_req, res) => {
  return sendSuccess(res, DeliveryService.getZones());
});

router.post('/quote', (req, res, next) => {
  try {
    const schema = z.object({
      subtotal: z.coerce.number().min(0),
      distanceKm: z.coerce.number().min(0).optional(),
      latitude: z.coerce.number().optional(),
      longitude: z.coerce.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid quote', parsed.error.flatten());
    DeliveryService.validateCoordinates(parsed.data.latitude, parsed.data.longitude);
    const quote = DeliveryService.calculatePrice({
      subtotal: parsed.data.subtotal,
      distanceKm: parsed.data.distanceKm,
    });
    return sendSuccess(res, quote);
  } catch (e) {
    next(e);
  }
});

export default router;
