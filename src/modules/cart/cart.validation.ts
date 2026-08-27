import { z } from 'zod';

export const addCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50),
  variantName: z.string().max(80).optional(),
  cakeMessage: z.string().max(150).optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(50),
  variantName: z.string().max(80).optional(),
  cakeMessage: z.string().max(150).optional(),
});
