import type { OrderStatus, PaymentMethod, DeliveryType, UserRole } from '@totli/types';

export const APP_NAME = 'TOTLI';
export const APP_DESCRIPTION = 'Telegram orqali tort va shirinliklarga buyurtma';

export const SUPPORTED_LANGUAGES = ['uz', 'ru', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'uz';

export const ORDER_STATUSES: OrderStatus[] = [
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
];

export const USER_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATOR',
  'CONTENT_MANAGER',
  'customer',
];

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'click', 'payme'];
export const DELIVERY_TYPES: DeliveryType[] = ['delivery', 'pickup'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, Record<SupportedLanguage, string>> = {
  NEW: { uz: 'Yangi', ru: 'Новый', en: 'New' },
  CONFIRMED: { uz: 'Tasdiqlandi', ru: 'Подтверждён', en: 'Confirmed' },
  PREPARING: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Preparing' },
  READY: { uz: 'Tayyor', ru: 'Готов', en: 'Ready' },
  DELIVERING: { uz: 'Yetkazilmoqda', ru: 'Доставляется', en: 'Delivering' },
  COMPLETED: { uz: 'Yakunlandi', ru: 'Завершён', en: 'Completed' },
  CANCELLED: { uz: 'Bekor qilindi', ru: 'Отменён', en: 'Cancelled' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, Record<SupportedLanguage, string>> = {
  cash: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
  card: { uz: 'Karta', ru: 'Карта', en: 'Card' },
  click: { uz: 'Click', ru: 'Click', en: 'Click' },
  payme: { uz: 'Payme', ru: 'Payme', en: 'Payme' },
};

export const DEFAULT_DELIVERY_FEE = 15000;
export const FREE_DELIVERY_THRESHOLD = 150000;
export const CURRENCY = 'UZS';
export const CURRENCY_SYMBOL = "so'm";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
