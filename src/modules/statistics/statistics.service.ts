import { OrderModel } from '../orders/order.model.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { UserModel } from '../users/user.model.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d;
}

export const StatisticsService = {
  async dashboard() {
    const today = startOfDay();

    const [
      todayTotal,
      byStatus,
      todayRevenue,
      recentOrders,
      totalProducts,
      totalCustomers,
    ] = await Promise.all([
      OrderModel.countDocuments({ createdAt: { $gte: today } }),
      OrderModel.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      OrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: today },
            status: { $nin: ['CANCELLED'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      OrderModel.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderNumber customerName customerPhone status total items createdAt')
        .lean(),
      // The dashboard must not fail because the catalog source is down.
      CatalogService.countProducts().catch(() => 0),
      UserModel.countDocuments(),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) {
      statusMap[s._id] = s.count;
    }

    // Bestsellers last 30 days
    const bestsellers = await OrderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: daysAgo(30) },
          status: { $nin: ['CANCELLED'] },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.name' },
          image: { $first: '$items.image' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 },
    ]);

    // Revenue by day last 7 days
    const revenueSeries = await OrderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: daysAgo(6) },
          status: { $nin: ['CANCELLED'] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      today: {
        totalOrders: todayTotal,
        revenue: todayRevenue[0]?.total ?? 0,
        NEW: statusMap.NEW ?? 0,
        CONFIRMED: statusMap.CONFIRMED ?? 0,
        PREPARING: statusMap.PREPARING ?? 0,
        READY: statusMap.READY ?? 0,
        DELIVERING: statusMap.DELIVERING ?? 0,
        COMPLETED: statusMap.COMPLETED ?? 0,
        CANCELLED: statusMap.CANCELLED ?? 0,
      },
      totals: {
        products: totalProducts,
        customers: totalCustomers,
      },
      revenueSeries: revenueSeries.map((r) => ({
        date: r._id,
        revenue: r.revenue,
        orders: r.orders,
      })),
      bestsellers: bestsellers.map((b) => ({
        productId: String(b._id),
        name: b.name,
        image: b.image,
        quantitySold: b.quantitySold,
        revenue: b.revenue,
      })),
      recentOrders: recentOrders.map((o) => ({
        _id: String(o._id),
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        status: o.status,
        total: o.total,
        itemCount: (o.items as unknown[])?.length ?? 0,
        createdAt: o.createdAt,
      })),
    };
  },

  async overview(period: 'today' | '7d' | '30d' = '7d') {
    const from =
      period === 'today' ? startOfDay() : period === '7d' ? daysAgo(6) : daysAgo(29);

    const [orders, revenue, cancelled, completed, newCustomers] = await Promise.all([
      OrderModel.countDocuments({ createdAt: { $gte: from } }),
      OrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: from },
            status: { $nin: ['CANCELLED'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      OrderModel.countDocuments({ createdAt: { $gte: from }, status: 'CANCELLED' }),
      OrderModel.countDocuments({ createdAt: { $gte: from }, status: 'COMPLETED' }),
      UserModel.countDocuments({ createdAt: { $gte: from } }),
    ]);

    const rev = revenue[0]?.total ?? 0;
    const paidCount = revenue[0]?.count ?? 0;

    return {
      period,
      orders,
      revenue: rev,
      averageOrderValue: paidCount > 0 ? Math.round(rev / paidCount) : 0,
      completed,
      cancelled,
      newCustomers,
    };
  },
};
