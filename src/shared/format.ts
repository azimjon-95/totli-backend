import { CURRENCY_SYMBOL, DEFAULT_DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from './constants.js';

export function formatPrice(amount: number, showSymbol = true): string {
  const formatted = new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
  return showSymbol ? `${formatted} ${CURRENCY_SYMBOL}` : formatted;
}

export function calculateDeliveryFee(subtotal: number, isPickup = false): number {
  if (isPickup) return 0;
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return DEFAULT_DELIVERY_FEE;
}

export function calculateOrderTotal(subtotal: number, deliveryFee: number): number {
  return subtotal + deliveryFee;
}

export function generateOrderNumberPrefix(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `T${y}${m}${d}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getLocalized(
  field: { uz?: string; ru?: string; en?: string } | undefined,
  lang: 'uz' | 'ru' | 'en' = 'uz'
): string {
  if (!field) return '';
  return field[lang] || field.uz || field.ru || field.en || '';
}
