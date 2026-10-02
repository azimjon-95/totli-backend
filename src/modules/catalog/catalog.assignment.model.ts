import mongoose, { Schema } from 'mongoose';

/**
 * One row per dish an admin has moved to a category other than the automatic
 * one. The dish itself lives in LokmaGo; only the choice is stored here.
 */
const catalogAssignmentSchema = new Schema(
  {
    // LokmaGo dish id — an opaque external string, not a reference.
    productId: { type: String, required: true, unique: true },
    categorySlug: { type: String, required: true },
    productName: { type: String },
    assignedBy: { type: String },
    missCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const CatalogAssignmentModel = mongoose.model(
  'CatalogAssignment',
  catalogAssignmentSchema
);
