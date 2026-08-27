import mongoose from 'mongoose';
import { CartRepository } from './cart.repository.js';
import { ProductRepository } from '../products/product.repository.js';
import { sanitizePlainText } from '../../shared/sanitize.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

function recalc(items: { price: number; quantity: number }[]) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function toDto(cart: {
  _id: { toString(): string };
  userId: { toString(): string };
  items: unknown[];
  subtotal: number;
  updatedAt?: Date;
}) {
  return {
    _id: cart._id.toString(),
    userId: cart.userId.toString(),
    items: cart.items,
    subtotal: cart.subtotal,
    updatedAt: cart.updatedAt?.toISOString(),
  };
}

function itemKey(productId: string, variantName?: string | null) {
  return `${productId}::${variantName ?? ''}`;
}

export const CartService = {
  async get(userId: string) {
    const cart = await CartRepository.getOrCreate(userId);
    return toDto(cart);
  },

  async addItem(
    userId: string,
    input: { productId: string; quantity: number; variantName?: string; cakeMessage?: string }
  ) {
    if (!mongoose.Types.ObjectId.isValid(input.productId)) {
      throw new ValidationError('Invalid productId');
    }

    const product = await ProductRepository.findById(input.productId);
    if (!product) throw new NotFoundError('Product not found');
    if (!product.isAvailable) {
      throw new ValidationError('Product is not available for purchase');
    }

    // Resolve price from DB — never trust client
    let price = product.price;
    let name =
      typeof product.name === 'object' && product.name && 'uz' in product.name
        ? String((product.name as { uz: string }).uz)
        : 'Product';

    if (input.variantName && product.variants?.length) {
      const variant = product.variants.find((v) => v.name === input.variantName);
      if (!variant) throw new ValidationError('Invalid product variant');
      price = variant.price;
      name = `${name} (${variant.name})`;
    }

    const cakeMessage = input.cakeMessage
      ? sanitizePlainText(input.cakeMessage, 150)
      : undefined;

    const cart = await CartRepository.getOrCreate(userId);
    const key = itemKey(input.productId, input.variantName);
    const existingIdx = cart.items.findIndex(
      (i) => itemKey(String(i.productId), i.variantName) === key
    );

    const image = product.images?.[0];

    if (existingIdx >= 0) {
      const nextQty = cart.items[existingIdx].quantity + input.quantity;
      if (nextQty > 50) throw new ValidationError('Maximum quantity is 50');
      cart.items[existingIdx].quantity = nextQty;
      cart.items[existingIdx].price = price; // refresh price
      if (cakeMessage !== undefined) cart.items[existingIdx].cakeMessage = cakeMessage;
    } else {
      cart.items.push({
        productId: product._id,
        variantName: input.variantName,
        quantity: input.quantity,
        price,
        name,
        image,
        cakeMessage,
      });
    }

    cart.subtotal = recalc(cart.items);
    await CartRepository.save(cart);
    return toDto(cart);
  },

  async updateItem(
    userId: string,
    productId: string,
    input: { quantity: number; variantName?: string; cakeMessage?: string }
  ) {
    const cart = await CartRepository.getOrCreate(userId);
    const key = itemKey(productId, input.variantName);
    const idx = cart.items.findIndex(
      (i) => itemKey(String(i.productId), i.variantName) === key
    );
    if (idx < 0) throw new NotFoundError('Cart item not found');

    if (input.quantity === 0) {
      cart.items.splice(idx, 1);
    } else {
      // Refresh price from product
      const product = await ProductRepository.findById(productId);
      if (!product || !product.isAvailable) {
        throw new ValidationError('Product is not available');
      }
      let price = product.price;
      if (input.variantName && product.variants?.length) {
        const variant = product.variants.find((v) => v.name === input.variantName);
        if (variant) price = variant.price;
      }
      cart.items[idx].quantity = input.quantity;
      cart.items[idx].price = price;
      if (input.cakeMessage !== undefined) {
        cart.items[idx].cakeMessage = sanitizePlainText(input.cakeMessage, 150);
      }
    }

    cart.subtotal = recalc(cart.items);
    await CartRepository.save(cart);
    return toDto(cart);
  },

  async removeItem(userId: string, productId: string, variantName?: string) {
    const cart = await CartRepository.getOrCreate(userId);
    const key = itemKey(productId, variantName);
    cart.items = cart.items.filter(
      (i) => itemKey(String(i.productId), i.variantName) !== key
    ) as typeof cart.items;
    cart.subtotal = recalc(cart.items);
    await CartRepository.save(cart);
    return toDto(cart);
  },

  async clear(userId: string) {
    const cart = await CartRepository.clear(userId);
    if (!cart) {
      const created = await CartRepository.getOrCreate(userId);
      return toDto(created);
    }
    return toDto(cart);
  },
};
