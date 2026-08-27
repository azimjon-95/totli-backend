import { CategoryModel } from './category.model.js';

export const CategoryRepository = {
  findActiveSorted() {
    return CategoryModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  },

  findBySlug(slug: string, onlyActive = false) {
    const q: Record<string, unknown> = { slug: slug.toLowerCase() };
    if (onlyActive) q.isActive = true;
    return CategoryModel.findOne(q).lean();
  },

  findById(id: string) {
    return CategoryModel.findById(id);
  },

  findAllAdmin(filter: { isActive?: boolean } = {}) {
    const q: Record<string, unknown> = {};
    if (typeof filter.isActive === 'boolean') q.isActive = filter.isActive;
    return CategoryModel.find(q).sort({ sortOrder: 1, createdAt: -1 });
  },

  create(data: Record<string, unknown>) {
    return CategoryModel.create(data);
  },

  updateById(id: string, data: Record<string, unknown>) {
    return CategoryModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  },

  deleteById(id: string) {
    return CategoryModel.findByIdAndDelete(id);
  },

  existsBySlug(slug: string, excludeId?: string) {
    const q: Record<string, unknown> = { slug: slug.toLowerCase() };
    if (excludeId) q._id = { $ne: excludeId };
    return CategoryModel.exists(q);
  },
};
