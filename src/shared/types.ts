// ============================================================
// TOTLI Shared Types
// ============================================================

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'CONTENT_MANAGER' | 'customer';

export type OrderStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentMethod = 'cash' | 'card' | 'click' | 'payme';
export type DeliveryType = 'delivery' | 'pickup';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'CONTENT_MANAGER';

export interface IUser {
  _id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  photoUrl?: string;
  isActive: boolean;
  language: 'uz' | 'ru' | 'en';
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAdmin {
  _id: string;
  name: string;
  username: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  auth_date: number;
  hash: string;
}

export interface ICategory {
  _id: string;
  name: { uz: string; ru: string; en: string };
  slug: string;
  description?: { uz?: string; ru?: string; en?: string };
  image?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IProductVariant {
  name: string;
  price: number;
  weight?: number;
  servings?: number;
  isDefault?: boolean;
}

export interface IProduct {
  _id: string;
  name: { uz: string; ru: string; en: string };
  slug: string;
  description?: { uz?: string; ru?: string; en?: string };
  categoryId: string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  weight?: number;
  servings?: number;
  variants?: IProductVariant[];
  ingredients?: string[];
  allergens?: string[];
  isAvailable: boolean;
  isNew: boolean;
  isFeatured: boolean;
  stock?: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICartItem {
  productId: string;
  variantName?: string;
  quantity: number;
  price: number;
  name: string;
  image?: string;
  cakeMessage?: string;
}

export interface ICart {
  _id: string;
  userId: string;
  items: ICartItem[];
  subtotal: number;
  updatedAt: string;
}

export interface IOrderItem {
  productId: string;
  name: string;
  variantName?: string;
  quantity: number;
  price: number;
  image?: string;
  cakeMessage?: string;
}

export interface IOrder {
  _id: string;
  orderNumber: string;
  userId: string;
  telegramId: number;
  items: IOrderItem[];
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  deliveryType: DeliveryType;
  deliveryAddress?: {
    street: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
  };
  customerName: string;
  customerPhone: string;
  cakeMessage?: string;
  comment?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  estimatedTime?: number;
  adminNotes?: string;
  statusHistory: {
    status: OrderStatus;
    changedAt: string;
    changedBy?: string;
    note?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string | { code: string; message: string };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type SocketEvent =
  | 'order:created'
  | 'order:status_updated'
  | 'order:new_for_admin'
  | 'notification';

export interface OrderStatusUpdatePayload {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  message?: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface CustomerAuthResponse {
  user: IUser;
  tokens: AuthTokens;
}

export interface AdminAuthResponse {
  admin: Omit<IAdmin, never>;
  tokens: AuthTokens;
}
