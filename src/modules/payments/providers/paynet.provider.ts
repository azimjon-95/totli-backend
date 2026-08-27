import { env } from '../../../config/env.js';
import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, WebhookResult } from './types.js';

export const PaynetProvider: PaymentProvider = {
  name: 'PAYNET',
  isConfigured() {
    return Boolean(env.PAYNET_MERCHANT_ID && env.PAYNET_SECRET_KEY);
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: 'NOT_CONFIGURED', message: 'Paynet credentials not configured' };
    }
    return {
      status: 'PENDING',
      transactionId: `paynet_${input.orderId}_${Date.now()}`,
      message: 'Paynet provider foundation — complete integration with credentials',
    };
  },
  async handleWebhook(): Promise<WebhookResult> {
    return { handled: false };
  },
};
