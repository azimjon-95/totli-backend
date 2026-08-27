import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export type TokenType = 'customer' | 'admin';

export interface CustomerTokenPayload {
  type: 'customer';
  sub: string;
  telegramId: number;
}

export interface AdminTokenPayload {
  type: 'admin';
  sub: string;
  role: string;
}

export type TokenPayload = CustomerTokenPayload | AdminTokenPayload;

export function signCustomerToken(userId: string, telegramId: number): string {
  const payload: CustomerTokenPayload = {
    type: 'customer',
    sub: userId,
    telegramId,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signAdminToken(adminId: string, role: string): string {
  const payload: AdminTokenPayload = {
    type: 'admin',
    sub: adminId,
    role,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ADMIN_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    if (!decoded?.type || !decoded?.sub) {
      throw new UnauthorizedError('Invalid token payload');
    }
    return decoded;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}
