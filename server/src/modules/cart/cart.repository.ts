import { CartModel } from './cart.model.js';

export const CartRepository = {
  findByUserId(userId: string) {
    return CartModel.findOne({ userId });
  },

  async getOrCreate(userId: string) {
    let cart = await CartModel.findOne({ userId });
    if (!cart) {
      cart = await CartModel.create({ userId, items: [], subtotal: 0 });
    }
    return cart;
  },

  save(cart: InstanceType<typeof CartModel>) {
    return cart.save();
  },

  async clear(userId: string) {
    return CartModel.findOneAndUpdate(
      { userId },
      { $set: { items: [], subtotal: 0 } },
      { new: true }
    );
  },
};
