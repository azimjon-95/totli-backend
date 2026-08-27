import { OrderModel } from './order.model.js';

/**
 * Format: TOT-YYYYMMDD-XXXXX
 * Uses daily sequence with retry on unique collision.
 */
export async function generateOrderNumber(maxRetries = 5): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `TOT-${y}${m}${d}-`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const startOfDay = new Date(y, now.getMonth(), now.getDate());
    const count = await OrderModel.countDocuments({
      createdAt: { $gte: startOfDay },
    });
    const seq = String(count + 1 + attempt).padStart(5, '0');
    const orderNumber = `${prefix}${seq}`;

    const exists = await OrderModel.exists({ orderNumber });
    if (!exists) {
      return orderNumber;
    }
  }

  // Fallback: random suffix
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `${prefix}${rand}`;
}
