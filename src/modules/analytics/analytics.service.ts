import { AnalyticsEventModel, ANALYTICS_EVENTS } from './analytics.model.js';
import { ValidationError } from '../../shared/errors.js';

export const AnalyticsService = {
  async track(input: {
    event: string;
    userId?: string;
    sessionId?: string;
    productId?: string;
    categoryId?: string;
    orderId?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!(ANALYTICS_EVENTS as readonly string[]).includes(input.event)) {
      throw new ValidationError('Invalid analytics event');
    }

    // Strip sensitive keys from metadata
    const meta = { ...(input.metadata || {}) };
    for (const key of Object.keys(meta)) {
      if (/password|token|secret|initData|phone|address/i.test(key)) {
        delete meta[key];
      }
    }

    await AnalyticsEventModel.create({
      event: input.event,
      userId: input.userId,
      sessionId: input.sessionId?.slice(0, 64),
      productId: input.productId,
      categoryId: input.categoryId,
      orderId: input.orderId,
      source: input.source?.slice(0, 64),
      metadata: Object.keys(meta).length ? meta : undefined,
    });

    return { tracked: true };
  },

  async funnel(days = 7) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const events = [
      'APP_OPENED',
      'PRODUCT_VIEWED',
      'ADD_TO_CART',
      'CHECKOUT_STARTED',
      'ORDER_CREATED',
      'ORDER_COMPLETED',
    ] as const;

    const counts = await Promise.all(
      events.map(async (event) => {
        const n = await AnalyticsEventModel.countDocuments({
          event,
          createdAt: { $gte: from },
        });
        return { event, count: n };
      })
    );

    const map = Object.fromEntries(counts.map((c) => [c.event, c.count]));
    const opened = map.APP_OPENED || 0;
    const orders = map.ORDER_CREATED || 0;

    return {
      days,
      steps: counts,
      conversion: {
        viewToCart:
          map.PRODUCT_VIEWED > 0
            ? Math.round((map.ADD_TO_CART / map.PRODUCT_VIEWED) * 1000) / 10
            : 0,
        cartToCheckout:
          map.ADD_TO_CART > 0
            ? Math.round((map.CHECKOUT_STARTED / map.ADD_TO_CART) * 1000) / 10
            : 0,
        checkoutToOrder:
          map.CHECKOUT_STARTED > 0
            ? Math.round((orders / map.CHECKOUT_STARTED) * 1000) / 10
            : 0,
        openToOrder:
          opened > 0 ? Math.round((orders / opened) * 1000) / 10 : 0,
      },
    };
  },
};
