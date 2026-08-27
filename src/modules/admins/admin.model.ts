import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'CONTENT_MANAGER'] as const;
export type AdminRoleType = (typeof ADMIN_ROLES)[number];

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ADMIN_ROLES,
      required: true,
      default: 'ADMIN',
    },
    telegramId: { type: Number, unique: true, sparse: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export type AdminDocument = InferSchemaType<typeof adminSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AdminModel = mongoose.model('Admin', adminSchema);
