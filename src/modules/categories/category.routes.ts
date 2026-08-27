import { Router } from 'express';
import {
  listPublic,
  getBySlugPublic,
  listAdmin,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from './category.controller.js';
import { requireAdminAuth, requirePermission } from '../../middleware/auth.js';

const publicRouter = Router();
publicRouter.get('/', listPublic);
publicRouter.get('/:slug', getBySlugPublic);

const adminRouter = Router();
adminRouter.use(requireAdminAuth);
adminRouter.get('/', requirePermission('categories:read'), listAdmin);
adminRouter.get('/:id', requirePermission('categories:read'), getAdmin);
adminRouter.post('/', requirePermission('categories:write'), createAdmin);
adminRouter.patch('/:id', requirePermission('categories:write'), updateAdmin);
adminRouter.delete('/:id', requirePermission('categories:write'), deleteAdmin);

export { publicRouter as categoryPublicRoutes, adminRouter as categoryAdminRoutes };
