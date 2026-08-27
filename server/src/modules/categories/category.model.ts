import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const localizedString = {
  uz: { type: String, required: true, trim: true },
  ru: { type: String, trim: true },
  en: { type: String, trim: true },
};

const categorySchema = new Schema(
  {
    name: { type: localizedString, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: {
      uz: String,
      ru: String,
      en: String,
    },
    image: { type: String },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export type CategoryDocument = InferSchemaType<typeof categorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CategoryModel = mongoose.model('Category', categorySchema);
