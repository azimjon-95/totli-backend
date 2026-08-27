import { config } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, '../../../.env') });
config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_GROUP_ID: z.string().optional(),
  ADMIN_CHAT_ID: z.string().optional(),
  WEBAPP_URL: z.string().optional(),
  ADMIN_URL: z.string().optional(),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_ADMIN_EXPIRES_IN: z.string().default('8h'),
  TELEGRAM_AUTH_MAX_AGE_SEC: z.coerce.number().default(86400),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  ADMIN_TELEGRAM_IDS: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),

  // Payments (optional — NOT_CONFIGURED if missing)
  CLICK_MERCHANT_ID: z.string().optional(),
  CLICK_SERVICE_ID: z.string().optional(),
  CLICK_SECRET_KEY: z.string().optional(),
  PAYME_MERCHANT_ID: z.string().optional(),
  PAYME_SECRET_KEY: z.string().optional(),
  PAYNET_MERCHANT_ID: z.string().optional(),
  PAYNET_SECRET_KEY: z.string().optional(),

  // Delivery defaults (UZS)
  DELIVERY_BASE_PRICE: z.coerce.number().default(15000),
  DELIVERY_FREE_FROM: z.coerce.number().default(500000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export function paymentProviderStatus() {
  return {
    CLICK: Boolean(env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY)
      ? 'CONFIGURED'
      : 'NOT_CONFIGURED',
    PAYME: Boolean(env.PAYME_MERCHANT_ID && env.PAYME_SECRET_KEY)
      ? 'CONFIGURED'
      : 'NOT_CONFIGURED',
    PAYNET: Boolean(env.PAYNET_MERCHANT_ID && env.PAYNET_SECRET_KEY)
      ? 'CONFIGURED'
      : 'NOT_CONFIGURED',
  };
}
