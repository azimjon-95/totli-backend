import { Router } from 'express';
import {
  createOrder,
  quickOrder,
  listMyOrders,
  getMyOrder,
  listAdminOrders,
  getAdminOrder,
  updateOrderStatus,
} from './order.controller.js';
import {
  requireCustomerAuth,
  requireAdminAuth,
  requirePermission,
} from '../../middleware/auth.js';

const customerRouter = Router();
customerRouter.use(requireCustomerAuth);
customerRouter.post('/quick', quickOrder);
customerRouter.post('/', createOrder);
customerRouter.get('/', listMyOrders);
customerRouter.get('/:orderNumber', getMyOrder);

const adminRouter = Router();
adminRouter.use(requireAdminAuth);
adminRouter.get('/', requirePermission('orders:read'), listAdminOrders);
adminRouter.get('/:id', requirePermission('orders:read'), getAdminOrder);
adminRouter.patch(
  '/:id/status',
  requirePermission('orders:status'),
  updateOrderStatus
);

export { customerRouter as orderCustomerRoutes, adminRouter as orderAdminRoutes };
