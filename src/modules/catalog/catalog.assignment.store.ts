import mongoose from 'mongoose';
import { CatalogAssignmentModel } from './catalog.assignment.model.js';
import type { AssignmentRecord, AssignmentStore } from './catalog.assignments.js';

/**
 * Fail fast when MongoDB isn't connected. Mongoose would otherwise buffer the
 * query for 10 seconds, stalling the catalog refresh that is waiting on it.
 */
function assertConnected() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected');
  }
}

export const mongoAssignmentStore: AssignmentStore = {
  async list() {
    assertConnected();
    const rows = await CatalogAssignmentModel.find().lean();
    return rows.map(
      (r): AssignmentRecord => ({
        productId: r.productId,
        categorySlug: r.categorySlug,
        productName: r.productName ?? undefined,
        assignedBy: r.assignedBy ?? undefined,
        missCount: r.missCount ?? 0,
      })
    );
  },

  async upsert(record) {
    assertConnected();
    await CatalogAssignmentModel.updateOne(
      { productId: record.productId },
      {
        $set: {
          categorySlug: record.categorySlug,
          productName: record.productName,
          assignedBy: record.assignedBy,
          missCount: 0,
        },
      },
      { upsert: true }
    );
  },

  async remove(productId) {
    assertConnected();
    const result = await CatalogAssignmentModel.deleteOne({ productId });
    return result.deletedCount > 0;
  },

  async applyReconcile(plan) {
    assertConnected();
    const ops = [];

    if (plan.toReset.length) {
      ops.push({
        updateMany: {
          filter: { productId: { $in: plan.toReset } },
          update: { $set: { missCount: 0 } },
        },
      });
    }
    if (plan.toIncrement.length) {
      ops.push({
        updateMany: {
          filter: { productId: { $in: plan.toIncrement } },
          update: { $inc: { missCount: 1 } },
        },
      });
    }
    if (plan.toDelete.length) {
      ops.push({ deleteMany: { filter: { productId: { $in: plan.toDelete } } } });
    }

    if (ops.length) await CatalogAssignmentModel.bulkWrite(ops);
  },
};
