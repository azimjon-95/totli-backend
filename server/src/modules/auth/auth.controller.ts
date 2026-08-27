import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { telegramAuthSchema, adminLoginSchema } from './auth.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function telegramAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = telegramAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.flatten());
    }
    const result = await AuthService.authenticateTelegram(parsed.data.initData);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function adminLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.flatten());
    }
    const result = await AuthService.authenticateAdmin(
      parsed.data.login,
      parsed.data.password
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function meCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    // populated by requireCustomerAuth
    const user = (req as Request & { user?: unknown }).user;
    return sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function meAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = (req as Request & { admin?: unknown }).admin;
    return sendSuccess(res, { admin });
  } catch (err) {
    next(err);
  }
}
