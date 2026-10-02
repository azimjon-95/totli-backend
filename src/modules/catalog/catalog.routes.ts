import { Router } from 'express';
import {
  assignProductCategory,
  catalogIsReadOnly,
  clearProductCategory,
  getCategoryAdmin,
  getCategoryPublic,
  getProductAdmin,
  getProductPublic,
  listCategoriesAdmin,
  listCategoriesPublic,
  listProductsAdmin,
  listProductsPublic,
} from './catalog.controller.js';
import { requireAdminAuth, requirePermission } from '../../middleware/auth.js';

/* ----------------------------------------------------------------- public */

const categoryPublicRoutes = Router();
categoryPublicRoutes.get('/', listCategoriesPublic);
categoryPublicRoutes.get('/:slug', getCategoryPublic);

const productPublicRoutes = Router();
productPublicRoutes.get('/', listProductsPublic);
productPublicRoutes.get('/:id', getProductPublic);

/* ------------------------------------------------------------------ admin */
// Reads mirror the catalog so the panel's lists keep working. Dishes and
// categories themselves are edited in LokmaGo, so create/update/delete answer
// 501 — except choosing a dish's category, which is stored here. Authentication
// still comes first, so anonymous callers see 401.

const categoryAdminRoutes = Router();
categoryAdminRoutes.use(requireAdminAuth);
categoryAdminRoutes.get('/', requirePermission('categories:read'), listCategoriesAdmin);
categoryAdminRoutes.get('/:id', requirePermission('categories:read'), getCategoryAdmin);
categoryAdminRoutes.post('/', requirePermission('categories:write'), catalogIsReadOnly);
categoryAdminRoutes.patch('/:id', requirePermission('categories:write'), catalogIsReadOnly);
categoryAdminRoutes.delete('/:id', requirePermission('categories:write'), catalogIsReadOnly);

const productAdminRoutes = Router();
productAdminRoutes.use(requireAdminAuth);
productAdminRoutes.get('/', requirePermission('products:read'), listProductsAdmin);
productAdminRoutes.get('/:id', requirePermission('products:read'), getProductAdmin);
// The one thing admins can change: which category a dish is shelved in.
productAdminRoutes.put('/:id/category', requirePermission('products:write'), assignProductCategory);
productAdminRoutes.delete('/:id/category', requirePermission('products:write'), clearProductCategory);
productAdminRoutes.post('/', requirePermission('products:write'), catalogIsReadOnly);
productAdminRoutes.patch('/:id', requirePermission('products:write'), catalogIsReadOnly);
productAdminRoutes.delete('/:id', requirePermission('products:write'), catalogIsReadOnly);

export {
  categoryPublicRoutes,
  categoryAdminRoutes,
  productPublicRoutes,
  productAdminRoutes,
};
