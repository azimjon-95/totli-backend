import { Router } from 'express';
import {
  listPublic,
  getBySlugPublic,
  listAdmin,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from './product.controller.js';
import { requireAdminAuth, requirePermission } from '../../middleware/auth.js';

const publicRouter = Router();
publicRouter.get('/', listPublic);
publicRouter.get('/:slug', getBySlugPublic);

const adminRouter = Router();
adminRouter.use(requireAdminAuth);
adminRouter.get('/', requirePermission('products:read'), listAdmin);
adminRouter.get('/:id', requirePermission('products:read'), getAdmin);
adminRouter.post('/', requirePermission('products:write'), createAdmin);
adminRouter.patch('/:id', requirePermission('products:write'), updateAdmin);
adminRouter.delete('/:id', requirePermission('products:write'), deleteAdmin);

export { publicRouter as productPublicRoutes, adminRouter as productAdminRoutes };
