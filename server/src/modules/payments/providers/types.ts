export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  currency: string;
  returnUrl?: string;
  description?: string;
}

export interface CreatePaymentResult {
  status: 'PENDING' | 'NOT_CONFIGURED';
  paymentUrl?: string;
  transactionId?: string;
  message?: string;
}

export interface WebhookResult {
  handled: boolean;
  paymentStatus?: string;
  orderId?: string;
  providerTransactionId?: string;
}

export interface PaymentProvider {
  name: string;
  isConfigured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  handleWebhook(payload: unknown, headers: Record<string, string | undefined>): Promise<WebhookResult>;
}
