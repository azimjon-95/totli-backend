import { ProductModel } from './product.model.js';
import type { FilterQuery } from 'mongoose';

export interface ProductListQuery {
  page: number;
  limit: number;
  categoryId?: string;
  categorySlug?: string;
  search?: string;
  sort?: string;
  isNew?: boolean;
  isFeatured?: boolean;
  isAvailable?: boolean;
  admin?: boolean;
}

export const ProductRepository = {
  findById(id: string) {
    return ProductModel.findById(id);
  },

  findBySlug(slug: string) {
    return ProductModel.findOne({ slug: slug.toLowerCase() });
  },

  existsBySlug(slug: string, excludeId?: string) {
    const q: Record<string, unknown> = { slug: slug.toLowerCase() };
    if (excludeId) q._id = { $ne: excludeId };
    return ProductModel.exists(q);
  },

  create(data: Record<string, unknown>) {
    return ProductModel.create(data);
  },

  updateById(id: string, data: Record<string, unknown>) {
    return ProductModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  },

  deleteById(id: string) {
    return ProductModel.findByIdAndDelete(id);
  },

  async list(query: ProductListQuery) {
    const filter: FilterQuery<typeof ProductModel> = {};

    if (!query.admin) {
      // Public: show available + optionally unavailable for catalog visibility
      // Spec: unavailable may show but cannot add to cart — still list them
    }

    if (query.categoryId) filter.categoryId = query.categoryId;
    if (typeof query.isNew === 'boolean') filter.isNew = query.isNew;
    if (typeof query.isFeatured === 'boolean') filter.isFeatured = query.isFeatured;
    if (typeof query.isAvailable === 'boolean') filter.isAvailable = query.isAvailable;

    if (query.search?.trim()) {
      const s = query.search.trim();
      filter.$or = [
        { 'name.uz': { $regex: s, $options: 'i' } },
        { 'name.ru': { $regex: s, $options: 'i' } },
        { 'name.en': { $regex: s, $options: 'i' } },
        { 'description.uz': { $regex: s, $options: 'i' } },
        { 'description.ru': { $regex: s, $options: 'i' } },
        { 'description.en': { $regex: s, $options: 'i' } },
      ];
    }

    let sort: Record<string, 1 | -1> = { sortOrder: 1, createdAt: -1 };
    switch (query.sort) {
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'price_asc':
        sort = { price: 1 };
        break;
      case 'price_desc':
        sort = { price: -1 };
        break;
      case 'popular':
        // placeholder until analytics — featured then sortOrder
        sort = { isFeatured: -1, sortOrder: 1 };
        break;
      case 'sort_order':
      default:
        sort = { sortOrder: 1, createdAt: -1 };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      ProductModel.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
      ProductModel.countDocuments(filter),
    ]);

    return { items, total };
  },
};
