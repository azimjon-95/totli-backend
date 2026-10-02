import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const cartItemSchema = new Schema(
  {
    // LokmaGo dish id — an opaque external string, not a reference to a local collection.
    productId: { type: String, required: true },
    variantName: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    name: { type: String, required: true },
    image: { type: String },
    cakeMessage: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const cartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: [cartItemSchema],
    subtotal: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export type CartDocument = InferSchemaType<typeof cartSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CartModel = mongoose.model('Cart', cartSchema);
