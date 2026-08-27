import helmet from 'helmet';
import cors from 'cors';
import { env, isDev } from '../config/env.js';

export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || origins.includes(origin) || isDev) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
