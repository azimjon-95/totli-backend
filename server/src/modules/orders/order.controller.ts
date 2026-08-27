import type { Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service.js';
import {
  createOrderSchema,
  quickOrderSchema,
  updateOrderStatusSchema,
  orderListQuerySchema,
} from './order.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

function customerId(req: Request): string {
  return (req as Request & { customerId: string }).customerId;
}

function adminId(req: Request): string {
  return (req as Request & { adminId: string }).adminId;
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid order', parsed.error.flatten());
    const data = await OrderService.create(customerId(req), parsed.data);
    return sendSuccess(res, data, 201);
  } catch (e) {
    next(e);
  }
}

export async function quickOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = quickOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid order', parsed.error.flatten());
    const data = await OrderService.quickCreate(customerId(req), parsed.data);
    return sendSuccess(res, data, 201);
  } catch (e) {
    next(e);
  }
}

export async function listMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const data = await OrderService.listMine(
      customerId(req),
      parsed.data.page,
      parsed.data.limit
    );
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getMyOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await OrderService.getMineByNumber(
      customerId(req),
      req.params.orderNumber as string
    );
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function listAdminOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const data = await OrderService.listAdmin(parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getAdminOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await OrderService.getAdminById(req.params.id as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid status', parsed.error.flatten());
    const data = await OrderService.updateStatus(
      req.params.id as string,
      parsed.data.status,
      adminId(req),
      parsed.data.note
    );
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
