import type { Request, Response, NextFunction } from 'express';
import { CategoryService } from './category.service.js';
import { createCategorySchema, updateCategorySchema } from './category.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function listPublic(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CategoryService.listPublic();
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getBySlugPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CategoryService.getBySlugPublic(req.params.slug as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const isActive =
      req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
    const data = await CategoryService.listAdmin(isActive);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CategoryService.getByIdAdmin(req.params.id as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function createAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid category data', parsed.error.flatten());
    const data = await CategoryService.create(parsed.data);
    return sendSuccess(res, data, 201);
  } catch (e) {
    next(e);
  }
}

export async function updateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid category data', parsed.error.flatten());
    const data = await CategoryService.update(req.params.id as string, parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function deleteAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CategoryService.remove(req.params.id as string);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
