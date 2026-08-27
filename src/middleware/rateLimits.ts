import rateLimit from 'express-rate-limit';

const jsonMessage = (message: string) => ({
  success: false,
  error: { code: 'RATE_LIMITED', message },
});

/** Auth endpoints (login, telegram) */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many auth attempts'),
});

/** Order creation */
export const orderRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many order requests'),
});

/** Search / public list */
export const searchRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many search requests'),
});

/** Payment webhooks */
export const webhookRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many webhook requests'),
});
