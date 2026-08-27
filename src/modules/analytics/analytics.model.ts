import mongoose, { Schema } from 'mongoose';

export const ANALYTICS_EVENTS = [
  'APP_OPENED',
  'CATEGORY_VIEWED',
  'PRODUCT_VIEWED',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'CART_VIEWED',
  'CHECKOUT_STARTED',
  'ORDER_CREATED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'TELEGRAM_APP_OPENED',
  'DEEPLINK_OPENED',
] as const;

const analyticsSchema = new Schema(
  {
    event: { type: String, required: true, enum: ANALYTICS_EVENTS, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    sessionId: { type: String, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    source: { type: String, maxlength: 64 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

analyticsSchema.index({ createdAt: -1 });
analyticsSchema.index({ event: 1, createdAt: -1 });

export const AnalyticsEventModel = mongoose.model('AnalyticsEvent', analyticsSchema);
