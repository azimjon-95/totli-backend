import mongoose, { Schema } from 'mongoose';

export const PAYMENT_PROVIDERS = ['CLICK', 'PAYME', 'PAYNET', 'CASH'] as const;
export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'REFUND_PENDING',
  'REFUND_FAILED',
] as const;

const paymentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'UZS' },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    transactionId: { type: String, unique: true, sparse: true },
    providerTransactionId: { type: String, index: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ orderId: 1, status: 1 });

export const PaymentModel = mongoose.model('Payment', paymentSchema);
