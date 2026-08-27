import { env } from '../../../config/env.js';
import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, WebhookResult } from './types.js';

export const PaymeProvider: PaymentProvider = {
  name: 'PAYME',
  isConfigured() {
    return Boolean(env.PAYME_MERCHANT_ID && env.PAYME_SECRET_KEY);
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: 'NOT_CONFIGURED', message: 'Payme credentials not configured' };
    }
    return {
      status: 'PENDING',
      transactionId: `payme_${input.orderId}_${Date.now()}`,
      message: 'Payme provider foundation — complete integration with credentials',
    };
  },
  async handleWebhook(): Promise<WebhookResult> {
    return { handled: false };
  },
};
