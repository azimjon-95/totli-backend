import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type CustomerTokenPayload, type AdminTokenPayload } from '../shared/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors.js';
import { UserRepository } from '../modules/users/user.repository.js';
import { AdminRepository } from '../modules/admins/admin.repository.js';
import { hasPermission, type Permission } from '../shared/permissions.js';
import type { AdminRoleType } from '../modules/admins/admin.model.js';

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function requireCustomerAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedError('Authentication required');

    const payload = verifyToken(token);
    if (payload.type !== 'customer') {
      throw new ForbiddenError('Customer token required');
    }

    const customerPayload = payload as CustomerTokenPayload;
    const user = await UserRepository.findById(customerPayload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    (req as Request & { user: unknown; customerId: string }).user = {
      _id: user._id.toString(),
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      photoUrl: user.photoUrl,
      language: user.language,
      isActive: user.isActive,
    };
    (req as Request & { customerId: string }).customerId = user._id.toString();
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedError('Authentication required');

    const payload = verifyToken(token);
    if (payload.type !== 'admin') {
      throw new ForbiddenError('Admin token required');
    }

    const adminPayload = payload as AdminTokenPayload;
    const admin = await AdminRepository.findById(adminPayload.sub);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedError('Admin not found or inactive');
    }

    (req as Request & { admin: unknown; adminId: string }).admin = {
      _id: admin._id.toString(),
      name: admin.name,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    };
    (req as Request & { adminId: string }).adminId = admin._id.toString();
    (req as Request & { adminRole: AdminRoleType }).adminRole = admin.role as AdminRoleType;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as Request & { adminRole?: AdminRoleType }).adminRole;
    if (!role) {
      return next(new ForbiddenError('Admin role required'));
    }
    const allowed = permissions.every((p) => hasPermission(role, p));
    if (!allowed) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}
