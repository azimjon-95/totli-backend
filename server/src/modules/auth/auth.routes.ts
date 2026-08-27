import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  telegramAuth,
  adminLogin,
  meCustomer,
  meAdmin,
} from './auth.controller.js';
import { requireCustomerAuth, requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

const telegramAuthLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' },
  },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts' },
  },
});

// Customer (Telegram Mini App)
router.post('/telegram', telegramAuthLimiter, telegramAuth);
router.get('/me', requireCustomerAuth, meCustomer);

// Admin
router.post('/admin/login', adminLoginLimiter, adminLogin);
router.get('/admin/me', requireAdminAuth, meAdmin);

export default router;
