import type { Request, Response, NextFunction } from 'express';
import { ProductService } from './product.service.js';
import {
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
} from './product.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function listPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = productListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const data = await ProductService.listPublic(parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getBySlugPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await ProductService.getBySlugPublic(req.params.slug as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = productListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const data = await ProductService.listAdmin({
      page: parsed.data.page,
      limit: parsed.data.limit,
      categoryId: parsed.data.categoryId,
      search: parsed.data.search,
      sort: parsed.data.sort,
      isAvailable: parsed.data.isAvailable,
    });
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await ProductService.getByIdAdmin(req.params.id as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function createAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid product data', parsed.error.flatten());
    const data = await ProductService.create(parsed.data);
    return sendSuccess(res, data, 201);
  } catch (e) {
    next(e);
  }
}

export async function updateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid product data', parsed.error.flatten());
    const data = await ProductService.update(req.params.id as string, parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function deleteAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await ProductService.remove(req.params.id as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
