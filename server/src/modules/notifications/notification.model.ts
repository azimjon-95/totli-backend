import mongoose, { Schema } from 'mongoose';

const notificationSchema = new Schema(
  {
    notificationType: { type: String, required: true, index: true },
    orderId: { type: String, index: true },
    orderNumber: { type: String },
    recipient: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    idempotencyKey: { type: String, unique: true, sparse: true },
    payload: { type: Schema.Types.Mixed },
    sentAt: { type: Date },
    nextRetryAt: { type: Date },
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model('Notification', notificationSchema);
