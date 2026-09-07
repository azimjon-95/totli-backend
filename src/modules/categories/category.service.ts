import { CategoryRepository } from './category.repository.js';
import { ProductModel } from '../products/product.model.js';
import { slugify } from '../../shared/slug.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { cacheGet, cacheSet, cacheDel } from '../../shared/cache.js';
import { MenuService } from '../menu/menu.service.js';

function toDto(doc: Record<string, unknown>) {
  return {
    _id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    image: doc.image,
    sortOrder: doc.sortOrder ?? 0,
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

export const CategoryService = {
  async listPublic() {
    const cached = await cacheGet<unknown[]>('categories:public');
    if (cached) return cached;

    const items = await CategoryRepository.findActiveSorted();
    const data = items.map((i) => toDto(i as Record<string, unknown>));
    await cacheSet('categories:public', data, 60);
    return data;
  },

  async getBySlugPublic(slug: string) {
    const cat = await CategoryRepository.findBySlug(slug, true);
    if (!cat) throw new NotFoundError('Category not found');
    return toDto(cat as Record<string, unknown>);
  },

  async listAdmin(isActive?: boolean) {
    const items = await CategoryRepository.findAllAdmin(
      typeof isActive === 'boolean' ? { isActive } : {}
    );
    return items.map((i) => toDto(i.toObject()));
  },

  async getByIdAdmin(id: string) {
    const cat = await CategoryRepository.findById(id);
    if (!cat) throw new NotFoundError('Category not found');
    return toDto(cat.toObject());
  },

  async create(input: {
    name: { uz: string; ru?: string; en?: string };
    slug?: string;
    description?: { uz?: string; ru?: string; en?: string };
    image?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const slug = (input.slug || slugify(input.name.uz)).toLowerCase();
    if (await CategoryRepository.existsBySlug(slug)) {
      throw new ConflictError('Category slug already exists');
    }
    const cat = await CategoryRepository.create({
      name: input.name,
      slug,
      description: input.description,
      image: input.image || undefined,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    });
    await cacheDel('categories:public');
    await MenuService.invalidate();
    return toDto(cat.toObject());
  },

  async update(
    id: string,
    input: Partial<{
      name: { uz: string; ru?: string; en?: string };
      slug: string;
      description: { uz?: string; ru?: string; en?: string };
      image: string;
      sortOrder: number;
      isActive: boolean;
    }>
  ) {
    const existing = await CategoryRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');

    const data: Record<string, unknown> = { ...input };
    if (input.slug) {
      const slug = input.slug.toLowerCase();
      if (await CategoryRepository.existsBySlug(slug, id)) {
        throw new ConflictError('Category slug already exists');
      }
      data.slug = slug;
    }
    if (input.image === '') data.image = undefined;

    const updated = await CategoryRepository.updateById(id, data);
    if (!updated) throw new NotFoundError('Category not found');
    await cacheDel('categories:public');
    await MenuService.invalidate();
    return toDto(updated.toObject());
  },

  async remove(id: string) {
    const existing = await CategoryRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');

    const productCount = await ProductModel.countDocuments({ categoryId: id });
    if (productCount > 0) {
      throw new ValidationError(
        `Cannot delete category: ${productCount} product(s) still linked. Move or delete products first.`
      );
    }

    await CategoryRepository.deleteById(id);
    await cacheDel('categories:public');
    await MenuService.invalidate();
    return { deleted: true };
  },
};
