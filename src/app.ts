import express from 'express';
import rateLimit from 'express-rate-limit';
import { securityHeaders, corsMiddleware } from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRateLimit, orderRateLimit, searchRateLimit } from './middleware/rateLimits.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import {
  categoryPublicRoutes,
  categoryAdminRoutes,
} from './modules/categories/category.routes.js';
import {
  productPublicRoutes,
  productAdminRoutes,
} from './modules/products/product.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import {
  orderCustomerRoutes,
  orderAdminRoutes,
} from './modules/orders/order.routes.js';
import statisticsRoutes from './modules/statistics/statistics.routes.js';
import customersAdminRoutes from './modules/users/user.admin.routes.js';
import {
  analyticsPublicRoutes,
  analyticsAdminRoutes,
} from './modules/analytics/analytics.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import deliveryRoutes from './modules/delivery/delivery.routes.js';
import {
  settingsPublicRoutes,
  settingsAdminRoutes,
} from './modules/settings/settings.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(securityHeaders);
  app.use(corsMiddleware);

  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      },
    })
  );

  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/auth', authRateLimit, authRoutes);
  app.use('/api/v1/categories', categoryPublicRoutes);
  app.use('/api/v1/products', searchRateLimit, productPublicRoutes);

  app.use('/api/v1/cart', cartRoutes);
  app.use('/api/v1/orders', orderRateLimit, orderCustomerRoutes);
  app.use('/api/v1/analytics', analyticsPublicRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/delivery', deliveryRoutes);
  app.use('/api/v1/settings', settingsPublicRoutes);

  app.use('/api/v1/admin/categories', categoryAdminRoutes);
  app.use('/api/v1/admin/products', productAdminRoutes);
  app.use('/api/v1/admin/orders', orderAdminRoutes);
  app.use('/api/v1/admin/statistics', statisticsRoutes);
  app.use('/api/v1/admin/customers', customersAdminRoutes);
  app.use('/api/v1/admin/analytics', analyticsAdminRoutes);
  app.use('/api/v1/admin/settings', settingsAdminRoutes);

  app.use('/api/health', healthRoutes);

  app.get('/api', (_req, res) => {
    res.json({ success: true, data: { message: 'TOTLI API', version: '1.0.0' } });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
