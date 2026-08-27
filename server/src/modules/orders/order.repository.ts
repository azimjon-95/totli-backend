import { OrderModel } from './order.model.js';
import type { FilterQuery } from 'mongoose';

export const OrderRepository = {
  create(data: Record<string, unknown>) {
    return OrderModel.create(data);
  },

  findById(id: string) {
    return OrderModel.findById(id);
  },

  findByOrderNumber(orderNumber: string) {
    return OrderModel.findOne({ orderNumber });
  },

  async listByUser(userId: string, page: number, limit: number) {
    const filter = { userId };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      OrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      OrderModel.countDocuments(filter),
    ]);
    return { items, total };
  },

  async listAdmin(query: {
    page: number;
    limit: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) {
    const filter: FilterQuery<typeof OrderModel> = {};
    if (query.status) filter.status = query.status;
    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) (filter.createdAt as Record<string, Date>).$gte = new Date(query.dateFrom);
      if (query.dateTo) (filter.createdAt as Record<string, Date>).$lte = new Date(query.dateTo);
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      filter.$or = [
        { orderNumber: { $regex: s, $options: 'i' } },
        { customerName: { $regex: s, $options: 'i' } },
        { customerPhone: { $regex: s, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      OrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      OrderModel.countDocuments(filter),
    ]);
    return { items, total };
  },
};
