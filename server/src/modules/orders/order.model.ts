import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const ORDER_STATUSES = [
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
] as const;

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    variantName: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },
    cakeMessage: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String },
    note: { type: String },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    telegramId: { type: Number, required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'NEW',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'click', 'payme'],
      default: 'cash',
    },
    deliveryType: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    deliveryAddress: {
      street: String,
      landmark: String,
      latitude: Number,
      longitude: Number,
    },
    customerName: { type: String, required: true },
    telegramUsername: { type: String, trim: true },
    customerPhone: { type: String, required: true },
    cakeMessage: { type: String, maxlength: 200 },
    comment: { type: String, maxlength: 500 },
    deliveryDate: { type: String },
    deliveryTime: { type: String },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    estimatedTime: { type: Number },
    adminNotes: { type: String },
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderDocument = InferSchemaType<typeof orderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const OrderModel = mongoose.model('Order', orderSchema);
