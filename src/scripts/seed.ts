/**
 * Development seed — creates a SUPER_ADMIN if none exists.
 * Never runs automatically in production.
 *
 * Usage: npm run seed
 * Optional: SEED_ADMIN_PASSWORD, SEED_ADMIN_TELEGRAM_ID
 */
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/mongo.js';
import { AdminModel } from '../modules/admins/admin.model.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { isProd } from '../config/env.js';
import { logger } from '../infrastructure/logger/index.js';

async function seed() {
  if (isProd) {
    console.error('Seed is disabled in production');
    process.exit(1);
  }

  await connectDatabase();

  const telegramId = process.env.SEED_ADMIN_TELEGRAM_ID
    ? Number(process.env.SEED_ADMIN_TELEGRAM_ID)
    : undefined;

  let admin = await AdminModel.findOne({ role: 'SUPER_ADMIN' });
  if (admin) {
    if (telegramId && !admin.telegramId) {
      admin.telegramId = telegramId;
      await admin.save();
      logger.info('Updated SUPER_ADMIN telegramId', { telegramId });
    }
    logger.info('SUPER_ADMIN already exists', { username: admin.username });
  } else {
    const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!ChangeMe';
    const passwordHash = await AuthService.hashPassword(password);
    admin = await AdminModel.create({
      name: 'Super Admin',
      username: 'superadmin',
      email: 'admin@totli.local',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
      ...(telegramId ? { telegramId } : {}),
    });
    logger.info('Created SUPER_ADMIN', {
      email: admin.email,
      username: admin.username,
      telegramId: admin.telegramId,
      passwordHint: 'SEED_ADMIN_PASSWORD or Admin123!ChangeMe',
    });
  }

  await disconnectDatabase();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
