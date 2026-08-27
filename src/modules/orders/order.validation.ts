import { z } from 'zod';
import { ORDER_STATUSES } from './order.model.js';
import { paginationSchema } from '../../shared/pagination.js';

export const createOrderSchema = z.object({
  customerPhone: z.string().min(7).max(20),
  customerName: z.string().min(1).max(120),
  telegramUsername: z.string().max(64).optional(),
  deliveryAddress: z
    .union([
      z.string().min(3).max(500),
      z.object({
        street: z.string().min(1).max(300),
        landmark: z.string().max(200).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      }),
    ])
    .optional(),
  deliveryType: z.enum(['delivery', 'pickup']).default('delivery'),
  paymentMethod: z.enum(['cash', 'card', 'click', 'payme', 'paynet']).default('cash'),
  deliveryDate: z.string().max(32).optional(),
  deliveryTime: z.string().max(32).optional(),
  comment: z.string().max(500).optional(),
  cakeMessage: z.string().max(150).optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
  distanceKm: z.coerce.number().min(0).optional(),
});

/** One-click: product + qty without cart */
export const quickOrderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  customerPhone: z.string().min(7).max(20),
  customerName: z.string().min(1).max(120),
  telegramUsername: z.string().max(64).optional(),
  deliveryAddress: z.string().min(3).max(500).optional(),
  deliveryType: z.enum(['delivery', 'pickup']).default('delivery'),
  deliveryDate: z.string().max(32).optional(),
  deliveryTime: z.string().max(32).optional(),
  comment: z.string().max(500).optional(),
  cakeMessage: z.string().max(150).optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES as unknown as [string, ...string[]]),
  note: z.string().max(300).optional(),
});

export const orderListQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().max(100).optional(),
});
