import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { UserModel } from './user.model.js';
import { OrderModel } from '../orders/order.model.js';
import { requireAdminAuth, requirePermission } from '../../middleware/auth.js';
import { sendSuccess } from '../../shared/response.js';
import { NotFoundError } from '../../shared/errors.js';
import { paginateMeta } from '../../shared/pagination.js';

const router = Router();
router.use(requireAdminAuth);

router.get('/', requirePermission('customers:read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const filter: Record<string, unknown> = {};
    if (search) {
      const n = Number(search);
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        ...(Number.isFinite(n) ? [{ telegramId: n }] : []),
      ];
    }
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      UserModel.countDocuments(filter),
    ]);
    return sendSuccess(res, {
      items: items.map((u) => ({
        _id: String(u._id),
        telegramId: u.telegramId,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        phone: u.phone,
        createdAt: u.createdAt,
      })),
      ...paginateMeta(total, page, limit),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', requirePermission('customers:read'), async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id).lean();
    if (!user) throw new NotFoundError('Customer not found');

    const orders = await OrderModel.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('orderNumber status total createdAt')
      .lean();

    const stats = await OrderModel.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] },
          },
          totalSpent: {
            $sum: {
              $cond: [{ $ne: ['$status', 'CANCELLED'] }, '$total', 0],
            },
          },
        },
      },
    ]);

    return sendSuccess(res, {
      customer: {
        _id: String(user._id),
        telegramId: user.telegramId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        phone: user.phone,
        createdAt: user.createdAt,
      },
      stats: stats[0] || {
        totalOrders: 0,
        completed: 0,
        cancelled: 0,
        totalSpent: 0,
      },
      orders: orders.map((o) => ({
        _id: String(o._id),
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
