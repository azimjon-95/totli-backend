import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { securityHeaders, corsMiddleware } from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import uploadRoutes from './modules/uploads/upload.routes.js';
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
import { menuPublicRoutes } from './modules/menu/menu.routes.js';
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

  // Every route is registered on a single v1 router, which is then mounted at
  // both `/api/v1` and `/v1`. Some reverse proxies forward `/api/…` untouched,
  // others strip the prefix (`proxy_pass http://host:port/;` with a trailing
  // slash does). Mounting twice makes the API behave identically either way,
  // so a proxy tweak can never turn into a silent 404 storm.
  const v1 = Router();

  v1.use('/health', healthRoutes);
  v1.use('/auth', authRateLimit, authRoutes);
  v1.use('/categories', categoryPublicRoutes);
  v1.use('/products', searchRateLimit, productPublicRoutes);
  v1.use('/menu', menuPublicRoutes);

  v1.use('/cart', cartRoutes);
  v1.use('/orders', orderRateLimit, orderCustomerRoutes);
  v1.use('/analytics', analyticsPublicRoutes);
  v1.use('/payments', paymentRoutes);
  v1.use('/delivery', deliveryRoutes);
  v1.use('/settings', settingsPublicRoutes);

  v1.use('/admin/categories', categoryAdminRoutes);
  v1.use('/admin/products', productAdminRoutes);
  v1.use('/admin/orders', orderAdminRoutes);
  v1.use('/admin/statistics', statisticsRoutes);
  v1.use('/admin/customers', customersAdminRoutes);
  v1.use('/admin/analytics', analyticsAdminRoutes);
  v1.use('/admin/settings', settingsAdminRoutes);
  v1.use('/admin/uploads', uploadRoutes);

  app.use('/api/v1', v1);
  app.use('/v1', v1);

  app.use('/api/health', healthRoutes);
  app.use('/health', healthRoutes);

  app.get(['/api', '/'], (_req, res) => {
    res.json({ success: true, data: { message: 'TOTLI API', version: '1.0.0' } });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
