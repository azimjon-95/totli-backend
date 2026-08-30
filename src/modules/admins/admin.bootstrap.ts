import bcrypt from 'bcryptjs';
import { AdminModel } from './admin.model.js';
import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logger/index.js';

/**
 * Creates (or updates) the SUPER_ADMIN account from `ADMIN_LOGIN` /
 * `ADMIN_PASSWORD` on every boot.
 *
 * This exists so a fresh deployment is usable without shelling into the
 * container to run a seed script: set two env vars, restart, log in.
 * It is idempotent — the password hash is only rewritten when the configured
 * password no longer matches the stored one.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const login = env.ADMIN_LOGIN?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;

  if (!login || !password) {
    logger.info('Bootstrap admin skipped — ADMIN_LOGIN/ADMIN_PASSWORD not set');
    return;
  }

  if (password.length < 8) {
    logger.warn(
      'ADMIN_PASSWORD is shorter than 8 characters — use a stronger one in production'
    );
  }

  const existing = await AdminModel.findOne({ username: login }).select('+passwordHash');

  if (!existing) {
    await AdminModel.create({
      name: 'Super Admin',
      username: login,
      email: `${login}@totli.local`,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    logger.info('Bootstrap admin created', { login });
    return;
  }

  const updates: Record<string, unknown> = {};

  const passwordMatches =
    existing.passwordHash && (await bcrypt.compare(password, existing.passwordHash));
  if (!passwordMatches) {
    updates.passwordHash = await bcrypt.hash(password, 12);
  }
  if (!existing.isActive) {
    updates.isActive = true;
  }
  if (existing.role !== 'SUPER_ADMIN') {
    updates.role = 'SUPER_ADMIN';
  }

  if (Object.keys(updates).length > 0) {
    await AdminModel.updateOne({ _id: existing._id }, { $set: updates });
    logger.info('Bootstrap admin updated', { login, fields: Object.keys(updates) });
  }
}
