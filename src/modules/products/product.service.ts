import mongoose from 'mongoose';
import { ProductRepository } from './product.repository.js';
import { CategoryRepository } from '../categories/category.repository.js';
import { slugify } from '../../shared/slug.js';
import { paginateMeta } from '../../shared/pagination.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { cacheGet, cacheSet, cacheDel } from '../../shared/cache.js';
import { MenuService } from '../menu/menu.service.js';

function normalizeImages(images: unknown[] | undefined): string[] {
  if (!images) return [];
  return images.map((img) => {
    if (typeof img === 'string') return img;
    if (img && typeof img === 'object' && 'url' in img) return String((img as { url: string }).url);
    return String(img);
  });
}

function toDto(doc: Record<string, unknown>) {
  return {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    categoryId: String(doc.categoryId),
    images: doc.images ?? [],
    price: doc.price,
    compareAtPrice: doc.compareAtPrice,
    weight: doc.weight,
    servings: doc.servings,
    variants: doc.variants,
    ingredients: doc.ingredients,
    allergens: doc.allergens,
    isAvailable: doc.isAvailable ?? true,
    isNew: doc.isNew ?? false,
    isFeatured: doc.isFeatured ?? false,
    stock: doc.stock,
    sortOrder: doc.sortOrder ?? 0,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

export const ProductService = {
  async listPublic(query: {
    page: number;
    limit: number;
    category?: string;
    categoryId?: string;
    search?: string;
    sort?: string;
    isNew?: boolean;
    isFeatured?: boolean;
  }) {
    let categoryId = query.categoryId;
    if (query.category && !categoryId) {
      const cat = await CategoryRepository.findBySlug(query.category, true);
      if (!cat) {
        return { items: [], ...paginateMeta(0, query.page, query.limit) };
      }
      categoryId = String((cat as { _id: unknown })._id);
    }

    const cacheKey = `products:public:${JSON.stringify({ ...query, categoryId })}`;
    const cached = await cacheGet<{ items: unknown[]; page: number; limit: number; total: number; totalPages: number }>(
      cacheKey
    );
    if (cached) return cached;

    const { items, total } = await ProductRepository.list({
      page: query.page,
      limit: query.limit,
      categoryId,
      search: query.search,
      sort: query.sort,
      isNew: query.isNew,
      isFeatured: query.isFeatured,
      admin: false,
    });

    const result = {
      items: items.map((i) => toDto(i as Record<string, unknown>)),
      ...paginateMeta(total, query.page, query.limit),
    };
    await cacheSet(cacheKey, result, 30);
    return result;
  },

  async getBySlugPublic(slug: string) {
    const product = await ProductRepository.findBySlug(slug);
    if (!product) throw new NotFoundError('Product not found');
    return toDto(product.toObject());
  },

  async listAdmin(query: {
    page: number;
    limit: number;
    categoryId?: string;
    search?: string;
    sort?: string;
    isAvailable?: boolean;
  }) {
    const { items, total } = await ProductRepository.list({
      ...query,
      admin: true,
    });
    return {
      items: items.map((i) => toDto(i as Record<string, unknown>)),
      ...paginateMeta(total, query.page, query.limit),
    };
  },

  async getByIdAdmin(id: string) {
    const product = await ProductRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    return toDto(product.toObject());
  },

  async create(input: Record<string, unknown> & { name: { uz: string }; categoryId: string }) {
    if (!mongoose.Types.ObjectId.isValid(input.categoryId)) {
      throw new ValidationError('Invalid categoryId');
    }
    const cat = await CategoryRepository.findById(input.categoryId);
    if (!cat) throw new ValidationError('Category does not exist');

    const slug = ((input.slug as string) || slugify(input.name.uz)).toLowerCase();
    if (await ProductRepository.existsBySlug(slug)) {
      throw new ConflictError('Product slug already exists');
    }

    const product = await ProductRepository.create({
      ...input,
      slug,
      images: normalizeImages(input.images as unknown[]),
    });
    await cacheDel('categories:public');
    await MenuService.invalidate();
    return toDto(product.toObject());
  },

  async update(id: string, input: Record<string, unknown>) {
    const existing = await ProductRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    if (input.categoryId) {
      if (!mongoose.Types.ObjectId.isValid(String(input.categoryId))) {
        throw new ValidationError('Invalid categoryId');
      }
      const cat = await CategoryRepository.findById(String(input.categoryId));
      if (!cat) throw new ValidationError('Category does not exist');
    }

    if (input.slug) {
      const slug = String(input.slug).toLowerCase();
      if (await ProductRepository.existsBySlug(slug, id)) {
        throw new ConflictError('Product slug already exists');
      }
      input.slug = slug;
    }

    if (input.images) {
      input.images = normalizeImages(input.images as unknown[]);
    }

    const updated = await ProductRepository.updateById(id, input);
    if (!updated) throw new NotFoundError('Product not found');
    await MenuService.invalidate();
    return toDto(updated.toObject());
  },

  async remove(id: string) {
    const existing = await ProductRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');
    await ProductRepository.deleteById(id);
    await MenuService.invalidate();
    return { deleted: true };
  },
};
