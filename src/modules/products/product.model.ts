import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const localizedString = {
  uz: { type: String, required: true, trim: true },
  ru: { type: String, trim: true },
  en: { type: String, trim: true },
};

const variantSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    weight: { type: Number, min: 0 },
    servings: { type: Number, min: 0 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    name: { type: localizedString, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: {
      uz: String,
      ru: String,
      en: String,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    images: [{ type: String }],
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    weight: { type: Number, min: 0 },
    servings: { type: Number, min: 0 },
    variants: [variantSchema],
    ingredients: [{ type: String }],
    allergens: [{ type: String }],
    isAvailable: { type: Boolean, default: true, index: true },
    isNew: { type: Boolean, default: false, index: true },
    isFeatured: { type: Boolean, default: false },
    stock: { type: Number, min: 0 },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

export type ProductDocument = InferSchemaType<typeof productSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProductModel = mongoose.model('Product', productSchema);
