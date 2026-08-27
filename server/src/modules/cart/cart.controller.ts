import type { Request, Response, NextFunction } from 'express';
import { CartService } from './cart.service.js';
import { addCartItemSchema, updateCartItemSchema } from './cart.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

function userId(req: Request): string {
  return (req as Request & { customerId: string }).customerId;
}

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CartService.get(userId(req));
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function addItem(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid cart item', parsed.error.flatten());
    const data = await CartService.addItem(userId(req), parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid cart update', parsed.error.flatten());
    const data = await CartService.updateItem(
      userId(req),
      req.params.productId as string,
      parsed.data
    );
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function removeItem(req: Request, res: Response, next: NextFunction) {
  try {
    const variantName =
      typeof req.query.variant === 'string' ? req.query.variant : undefined;
    const data = await CartService.removeItem(
      userId(req),
      req.params.productId as string,
      variantName
    );
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function clearCart(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CartService.clear(userId(req));
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
