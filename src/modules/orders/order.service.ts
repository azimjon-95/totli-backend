import { OrderModel } from './order.model.js';
import { OrderRepository } from './order.repository.js';
import { CartRepository } from '../cart/cart.repository.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { catalogIdSchema } from '../catalog/catalog.validation.js';
import { priceProduct } from '../catalog/catalog.pricing.js';
import { UserRepository } from '../users/user.repository.js';
import { generateOrderNumber } from './orderNumber.js';
import { assertTransition } from './order.transitions.js';
import { emitAppEvent } from '../../shared/events.js';
import { paginateMeta } from '../../shared/pagination.js';
import { sanitizePlainText } from '../../shared/sanitize.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../shared/errors.js';
import { getIdempotency, setIdempotency } from '../../shared/idempotency.js';
import { DeliveryService } from '../delivery/delivery.service.js';

function toDto(doc: Record<string, unknown>) {
  return {
    _id: String(doc._id),
    orderNumber: doc.orderNumber,
    userId: String(doc.userId),
    telegramId: doc.telegramId,
    items: doc.items,
    status: doc.status,
    paymentMethod: doc.paymentMethod,
    deliveryType: doc.deliveryType,
    deliveryAddress: doc.deliveryAddress,
    customerName: doc.customerName,
    telegramUsername: doc.telegramUsername,
    customerPhone: doc.customerPhone,
    cakeMessage: doc.cakeMessage,
    comment: doc.comment,
    deliveryDate: doc.deliveryDate,
    deliveryTime: doc.deliveryTime,
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    total: doc.total,
    statusHistory: doc.statusHistory,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

type OrderItemBuilt = {
  productId: string;
  name: string;
  variantName?: string;
  quantity: number;
  price: number;
  image?: string;
  cakeMessage?: string;
};

export const OrderService = {
  async create(
    userId: string,
    input: {
      customerPhone: string;
      customerName?: string;
      deliveryAddress?:
        | string
        | { street: string; landmark?: string; latitude?: number; longitude?: number };
      deliveryType?: string;
      paymentMethod?: string;
      deliveryDate?: string;
      deliveryTime?: string;
      comment?: string;
      cakeMessage?: string;
      telegramUsername?: string;
      idempotencyKey?: string;
      distanceKm?: number;
    }
  ) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    if (input.idempotencyKey) {
      const existingId = await getIdempotency(`order:${userId}:${input.idempotencyKey}`);
      if (existingId) {
        const existing = await OrderModel.findById(existingId);
        if (existing) return toDto(existing.toObject());
      }
    }

    const cart = await CartRepository.findByUserId(userId);
    if (!cart || cart.items.length === 0) {
      throw new ValidationError('Cart is empty');
    }

    const orderItems: OrderItemBuilt[] = [];

    // One snapshot for the whole order: every line is priced from the same catalog.
    const findProduct = await CatalogService.lookup();

    for (const item of cart.items) {
      const product = findProduct(String(item.productId));
      if (!product) {
        throw new ValidationError(`Product no longer exists: ${item.name}`);
      }
      if (!product.isAvailable) {
        throw new ValidationError(`Product not available: ${item.name}`);
      }

      // The price and name written on the order are the catalog's, as of now —
      // not whatever the cart remembered from when the item was added.
      const priced = priceProduct(product, item.variantName);

      if (item.quantity < 1 || item.quantity > 50) {
        throw new ValidationError('Invalid quantity');
      }

      orderItems.push({
        productId: product._id,
        name: priced.name,
        variantName: priced.variantName,
        quantity: item.quantity,
        price: priced.unitPrice,
        image: product.images[0] || item.image || undefined,
        cakeMessage: item.cakeMessage
          ? sanitizePlainText(item.cakeMessage, 150)
          : undefined,
      });
    }

    const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const quote = DeliveryService.calculatePrice({
      subtotal,
      distanceKm: input.distanceKm,
    });
    const deliveryFee = quote.deliveryFee;
    const total = subtotal + deliveryFee;

    let deliveryAddress:
      | { street: string; landmark?: string; latitude?: number; longitude?: number }
      | undefined;
    if (typeof input.deliveryAddress === 'string') {
      deliveryAddress = { street: input.deliveryAddress };
    } else if (input.deliveryAddress) {
      deliveryAddress = input.deliveryAddress;
    }

    const customerName =
      input.customerName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'Customer';

    let orderDoc = null;
    let orderNumber = await generateOrderNumber();

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        orderDoc = await OrderModel.create({
          orderNumber,
          userId: user._id,
          telegramId: user.telegramId,
          items: orderItems,
          status: 'NEW',
          paymentMethod: input.paymentMethod || 'cash',
          deliveryType: input.deliveryType || 'delivery',
          deliveryAddress,
          customerName,
          telegramUsername: input.telegramUsername
            ? String(input.telegramUsername).replace(/^@/, '').trim()
            : user.username || undefined,
          customerPhone: input.customerPhone,
          cakeMessage: input.cakeMessage
            ? sanitizePlainText(input.cakeMessage, 150)
            : undefined,
          comment: input.comment ? sanitizePlainText(input.comment, 500) : undefined,
          deliveryDate: input.deliveryDate,
          deliveryTime: input.deliveryTime,
          subtotal,
          deliveryFee,
          total,
          statusHistory: [
            { status: 'NEW', changedAt: new Date(), note: 'Order created' },
          ],
        });
        break;
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          orderNumber = await generateOrderNumber();
          continue;
        }
        throw err;
      }
    }

    if (!orderDoc) throw new ValidationError('Failed to create order');

    // Clear cart after successful order
    await CartRepository.clear(userId);

    if (input.idempotencyKey) {
      await setIdempotency(`order:${userId}:${input.idempotencyKey}`, orderDoc._id.toString());
    }

    await emitAppEvent({
      type: 'ORDER_CREATED',
      orderId: orderDoc._id.toString(),
      orderNumber: orderDoc.orderNumber,
      userId,
    });

    return toDto(orderDoc.toObject());
  },


  async quickCreate(
    userId: string,
    input: {
      productId: string;
      quantity: number;
      customerPhone: string;
      customerName: string;
      telegramUsername?: string;
      deliveryAddress?: string;
      deliveryType?: string;
      deliveryDate?: string;
      deliveryTime?: string;
      comment?: string;
      cakeMessage?: string;
      idempotencyKey?: string;
    }
  ) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    if (input.idempotencyKey) {
      const existingId = await getIdempotency(`qorder:${userId}:${input.idempotencyKey}`);
      if (existingId) {
        const existing = await OrderModel.findById(existingId);
        if (existing) return toDto(existing.toObject());
      }
    }

    if (!catalogIdSchema.safeParse(input.productId).success) {
      throw new NotFoundError('Product not found');
    }

    const product = (await CatalogService.lookup())(input.productId);
    if (!product) throw new NotFoundError('Product not found');
    if (!product.isAvailable) throw new ValidationError('Product not available');

    const qty = Math.min(50, Math.max(1, input.quantity || 1));
    // Quick order has no size picker; a product that requires one can't be
    // priced here and priceProduct says so.
    const priced = priceProduct(product);
    const name = priced.name;

    const price = priced.unitPrice;
    const subtotal = price * qty;
    const deliveryFee = 0;
    const total = subtotal + deliveryFee;

    const username = (
      input.telegramUsername ||
      user.username ||
      ''
    )
      .replace(/^@/, '')
      .trim();

    let orderDoc = null;
    let orderNumber = await generateOrderNumber();

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        orderDoc = await OrderModel.create({
          orderNumber,
          userId: user._id,
          telegramId: user.telegramId,
          items: [
            {
              productId: product._id,
              name,
              quantity: qty,
              price,
              image: product.images[0],
              cakeMessage: input.cakeMessage
                ? sanitizePlainText(input.cakeMessage, 150)
                : undefined,
            },
          ],
          status: 'NEW',
          paymentMethod: 'cash',
          deliveryType: input.deliveryType || 'delivery',
          deliveryAddress: input.deliveryAddress
            ? { street: sanitizePlainText(input.deliveryAddress, 500) }
            : undefined,
          customerName: sanitizePlainText(input.customerName, 120),
          telegramUsername: username || undefined,
          customerPhone: input.customerPhone,
          cakeMessage: input.cakeMessage
            ? sanitizePlainText(input.cakeMessage, 150)
            : undefined,
          comment: input.comment ? sanitizePlainText(input.comment, 500) : undefined,
          deliveryDate: input.deliveryDate,
          deliveryTime: input.deliveryTime,
          subtotal,
          deliveryFee,
          total,
          statusHistory: [
            { status: 'NEW', changedAt: new Date(), note: 'Quick order' },
          ],
        });
        break;
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          orderNumber = await generateOrderNumber();
          continue;
        }
        throw err;
      }
    }

    if (!orderDoc) throw new ValidationError('Failed to create order');

    if (input.idempotencyKey) {
      await setIdempotency(`qorder:${userId}:${input.idempotencyKey}`, orderDoc._id.toString());
    }

    await emitAppEvent({
      type: 'ORDER_CREATED',
      orderId: orderDoc._id.toString(),
      orderNumber: orderDoc.orderNumber,
      userId,
    });

    return toDto(orderDoc.toObject());
  },

  async listMine(userId: string, page: number, limit: number) {
    const { items, total } = await OrderRepository.listByUser(userId, page, limit);
    return {
      items: items.map((i) => toDto(i as Record<string, unknown>)),
      ...paginateMeta(total, page, limit),
    };
  },

  async getMineByNumber(userId: string, orderNumber: string) {
    const order = await OrderRepository.findByOrderNumber(orderNumber);
    if (!order) throw new NotFoundError('Order not found');
    if (String(order.userId) !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return toDto(order.toObject());
  },

  async listAdmin(query: {
    page: number;
    limit: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) {
    const { items, total } = await OrderRepository.listAdmin(query);
    return {
      items: items.map((i) => toDto(i as Record<string, unknown>)),
      ...paginateMeta(total, query.page, query.limit),
    };
  },

  async getAdminById(id: string) {
    const order = await OrderRepository.findById(id);
    if (!order) throw new NotFoundError('Order not found');
    return toDto(order.toObject());
  },

  async updateStatus(id: string, status: string, changedBy: string, note?: string) {
    const order = await OrderRepository.findById(id);
    if (!order) throw new NotFoundError('Order not found');

    try {
      assertTransition(order.status, status);
    } catch {
      throw new ValidationError(`Invalid status transition: ${order.status} → ${status}`);
    }

    const from = order.status;
    order.status = status as typeof order.status;
    order.statusHistory.push({
      status: status as typeof order.status,
      changedAt: new Date(),
      changedBy,
      note,
    });
    await order.save();

    await emitAppEvent({
      type: 'ORDER_STATUS_CHANGED',
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      from,
      to: status,
    });

    return toDto(order.toObject());
  },
};
