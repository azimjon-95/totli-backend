import { PaymentModel } from './payment.model.js';
import { OrderModel } from '../orders/order.model.js';
import { ClickProvider } from './providers/click.provider.js';
import { PaymeProvider } from './providers/payme.provider.js';
import { PaynetProvider } from './providers/paynet.provider.js';
import type { PaymentProvider } from './providers/types.js';
import { paymentProviderStatus } from '../../config/env.js';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors.js';

const providers: Record<string, PaymentProvider> = {
  CLICK: ClickProvider,
  PAYME: PaymeProvider,
  PAYNET: PaynetProvider,
};

export const PaymentService = {
  getStatus() {
    return paymentProviderStatus();
  },

  async createForOrder(params: {
    orderId: string;
    provider: string;
    idempotencyKey?: string;
  }) {
    const order = await OrderModel.findById(params.orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (params.idempotencyKey) {
      const existing = await PaymentModel.findOne({
        idempotencyKey: params.idempotencyKey,
      });
      if (existing) {
        return {
          payment: existing.toObject(),
          providerResult: { status: existing.status, transactionId: existing.transactionId },
          reused: true,
        };
      }
    }

    // Already paid?
    const paid = await PaymentModel.findOne({
      orderId: order._id,
      status: 'PAID',
    });
    if (paid) throw new ConflictError('Order already paid');

    if (params.provider === 'CASH') {
      const payment = await PaymentModel.create({
        orderId: order._id,
        provider: 'CASH',
        amount: order.total,
        currency: 'UZS',
        status: 'PENDING',
        idempotencyKey: params.idempotencyKey,
      });
      return {
        payment: payment.toObject(),
        providerResult: { status: 'PENDING' as const, message: 'Cash on delivery' },
        reused: false,
      };
    }

    const provider = providers[params.provider];
    if (!provider) throw new ValidationError('Unknown payment provider');

    // Amount ALWAYS from order — never from client
    const amount = order.total;

    const providerResult = await provider.createPayment({
      orderId: String(order._id),
      amount,
      currency: 'UZS',
      description: `TOTLI ${order.orderNumber}`,
    });

    if (providerResult.status === 'NOT_CONFIGURED') {
      throw new ValidationError(`${params.provider} is not configured`);
    }

    const payment = await PaymentModel.create({
      orderId: order._id,
      provider: params.provider,
      amount,
      currency: 'UZS',
      status: 'PENDING',
      transactionId: providerResult.transactionId,
      idempotencyKey: params.idempotencyKey,
      metadata: { paymentUrl: providerResult.paymentUrl },
    });

    return {
      payment: payment.toObject(),
      providerResult,
      reused: false,
    };
  },

  async handleWebhook(
    providerName: string,
    payload: unknown,
    headers: Record<string, string | undefined>
  ) {
    const provider = providers[providerName.toUpperCase()];
    if (!provider) throw new ValidationError('Unknown provider');

    // Provider must verify signature before returning handled=true
    const result = await provider.handleWebhook(payload, headers);
    if (!result.handled) {
      return { ok: false, message: 'Webhook not processed (provider foundation)' };
    }

    // Idempotent update by providerTransactionId
    if (result.providerTransactionId) {
      const payment = await PaymentModel.findOne({
        providerTransactionId: result.providerTransactionId,
      });
      if (payment && payment.status === 'PAID') {
        return { ok: true, alreadyProcessed: true };
      }
      if (payment && result.paymentStatus === 'PAID') {
        // Verify amount matches order
        const order = await OrderModel.findById(payment.orderId);
        if (!order || payment.amount !== order.total) {
          throw new ValidationError('Payment amount mismatch');
        }
        payment.status = 'PAID';
        await payment.save();
      }
    }

    return { ok: true, result };
  },
};
