import { env } from '../../../config/env.js';
import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, WebhookResult } from './types.js';

export const ClickProvider: PaymentProvider = {
  name: 'CLICK',
  isConfigured() {
    return Boolean(env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY);
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: 'NOT_CONFIGURED', message: 'Click credentials not configured' };
    }
    const transactionId = `click_${input.orderId}_${Date.now()}`;
    return {
      status: 'PENDING',
      transactionId,
      message: 'Click provider foundation — complete integration with credentials',
    };
  },
  async handleWebhook(): Promise<WebhookResult> {
    return { handled: false };
  },
};
