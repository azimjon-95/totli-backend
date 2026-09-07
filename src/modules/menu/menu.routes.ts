import { Router } from 'express';
import { getMenuPublic, getMenuCategoryPublic } from './menu.controller.js';

const publicRouter = Router();
publicRouter.get('/', getMenuPublic);
publicRouter.get('/:slug', getMenuCategoryPublic);

export { publicRouter as menuPublicRoutes };
