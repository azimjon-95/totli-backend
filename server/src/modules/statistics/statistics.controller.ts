import type { Request, Response, NextFunction } from 'express';
import { StatisticsService } from './statistics.service.js';
import { sendSuccess } from '../../shared/response.js';

export async function dashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await StatisticsService.dashboard();
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function overview(req: Request, res: Response, next: NextFunction) {
  try {
    const period = (req.query.period as 'today' | '7d' | '30d') || '7d';
    const data = await StatisticsService.overview(period);
    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
