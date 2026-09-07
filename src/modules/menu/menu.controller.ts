import type { Request, Response, NextFunction } from 'express';
import { MenuService } from './menu.service.js';
import { menuQuerySchema } from './menu.validation.js';
import { sendSuccess } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function getMenuPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = menuQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const data = await MenuService.getPublic(parsed.data);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getMenuCategoryPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = menuQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    const menu = await MenuService.getPublic({
      ...parsed.data,
      category: req.params.slug as string,
    });
    return sendSuccess(res, menu.categories[0]);
  } catch (e) {
    next(e);
  }
}
