import bcrypt from 'bcryptjs';
import { UserRepository } from '../users/user.repository.js';
import { AdminRepository } from '../admins/admin.repository.js';
import { validateTelegramInitData } from '../../infrastructure/telegram/validateInitData.js';
import { signCustomerToken, signAdminToken } from '../../shared/jwt.js';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { env } from '../../config/env.js';
import type { AdminDocument } from '../admins/admin.model.js';

function mapLang(code?: string): 'uz' | 'ru' | 'en' {
  if (!code) return 'uz';
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('en')) return 'en';
  return 'uz';
}

function toUserDto(user: {
  _id: { toString(): string };
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  language?: string;
  isActive?: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: user._id.toString(),
    telegramId: user.telegramId,
    username: user.username ?? undefined,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    phone: user.phone ?? undefined,
    photoUrl: user.photoUrl ?? undefined,
    language: (user.language as 'uz' | 'ru' | 'en') ?? 'uz',
    isActive: user.isActive ?? true,
    lastLoginAt: user.lastLoginAt?.toISOString(),
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: user.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toAdminDto(admin: AdminDocument) {
  return {
    _id: admin._id.toString(),
    name: admin.name,
    username: admin.username,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt?.toISOString(),
    createdAt: (admin as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: (admin as { updatedAt?: Date }).updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export const AuthService = {
  async authenticateTelegram(initData: string) {
    const validated = validateTelegramInitData(initData);
    const { user: tgUser } = validated;

    const user = await UserRepository.upsertFromTelegram({
      telegramId: tgUser.id,
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
      photoUrl: tgUser.photo_url,
      language: mapLang(tgUser.language_code),
    });

    if (!user.isActive) {
      throw new ForbiddenError('Account is disabled');
    }

    const accessToken = signCustomerToken(user._id.toString(), user.telegramId);

    return {
      user: toUserDto(user),
      tokens: {
        accessToken,
        expiresIn: env.JWT_EXPIRES_IN,
      },
    };
  },

  async authenticateAdmin(login: string, password: string) {
    if (!login?.trim() || !password) {
      throw new ValidationError('Login and password are required');
    }

    const admin = await AdminRepository.findByLogin(login);
    if (!admin || !admin.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new ForbiddenError('Admin account is disabled');
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid credentials');
    }

    await AdminRepository.updateLastLogin(admin._id.toString());

    const accessToken = signAdminToken(admin._id.toString(), admin.role);

    return {
      admin: toAdminDto(admin),
      tokens: {
        accessToken,
        expiresIn: env.JWT_ADMIN_EXPIRES_IN,
      },
    };
  },

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  },
};
