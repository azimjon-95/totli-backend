import { z } from 'zod';

export const telegramAuthSchema = z.object({
  initData: z.string().min(10, 'initData is required'),
});

export const adminLoginSchema = z.object({
  login: z.string().min(1, 'Login is required').max(120),
  password: z.string().min(1, 'Password is required').max(128),
});
