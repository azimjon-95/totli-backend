import type { Request, Response, NextFunction } from 'express';
import { CatalogService } from './catalog.service.js';
import {
  assignCategoryBodySchema,
  catalogIdSchema,
  catalogProductQuerySchema,
} from './catalog.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors.js';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Forwards a thrown/rejected error to the error handler, so each handler reads straight through. */
const wrap =
  (fn: Handler): Handler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

function parseQuery(req: Request) {
  const parsed = catalogProductQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
  return parsed.data;
}

function parseId(value: unknown) {
  const parsed = catalogIdSchema.safeParse(value);
  // A malformed id can't exist in the catalog, so it is simply "not found".
  if (!parsed.success) throw new NotFoundError('Product not found');
  return parsed.data;
}

/* ----------------------------------------------------------------- public */

export const listCategoriesPublic = wrap(async (_req, res) =>
  sendSuccess(res, await CatalogService.listCategories())
);

export const getCategoryPublic = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.getCategory(String(req.params.slug)))
);

export const listProductsPublic = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.listProducts(parseQuery(req)))
);

export const getProductPublic = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.getProduct(parseId(req.params.id)))
);

/* ------------------------------------------------- admin (read-only view) */

export const listCategoriesAdmin = wrap(async (_req, res) =>
  sendSuccess(res, await CatalogService.listCategories({ admin: true }))
);

export const getCategoryAdmin = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.getCategory(String(req.params.id), { admin: true }))
);

export const listProductsAdmin = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.listProductsAdmin(parseQuery(req)))
);

export const getProductAdmin = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.getProductAdmin(parseId(req.params.id)))
);

/* ----------------------------------------- admin: shelving dishes by hand */

export const assignProductCategory = wrap(async (req, res) => {
  const body = assignCategoryBodySchema.safeParse(req.body);
  if (!body.success) throw new ValidationError('Invalid category', body.error.flatten());

  const adminId = (req as Request & { adminId?: string }).adminId;
  sendSuccess(
    res,
    await CatalogService.assignCategory(parseId(req.params.id), body.data.categorySlug, adminId)
  );
});

export const clearProductCategory = wrap(async (req, res) =>
  sendSuccess(res, await CatalogService.clearCategory(parseId(req.params.id)))
);

/** The catalog is edited in LokmaGo; this panel only mirrors it. */
export const catalogIsReadOnly: Handler = (_req, _res, next) =>
  next(
    new AppError(
      501,
      "Katalog LokmaGo orqali boshqariladi — bu yerda o'zgartirib bo'lmaydi",
      'CATALOG_MANAGED_EXTERNALLY'
    )
  );
