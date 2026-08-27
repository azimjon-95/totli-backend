# Payment providers

## Status

| Provider | Status |
|----------|--------|
| CASH | Supported (on delivery) |
| CLICK | Architecture ready — **NOT_CONFIGURED** until env set |
| PAYME | Architecture ready — **NOT_CONFIGURED** until env set |
| PAYNET | Architecture ready — **NOT_CONFIGURED** until env set |

## ENV

```
CLICK_MERCHANT_ID=
CLICK_SERVICE_ID=
CLICK_SECRET_KEY=
PAYME_MERCHANT_ID=
PAYME_SECRET_KEY=
PAYNET_MERCHANT_ID=
PAYNET_SECRET_KEY=
```

## Security rules

1. Payment amount is always taken from **Order.total** in the database — never from the client.
2. Webhook must verify provider signature before marking PAID.
3. Idempotent webhook processing by `providerTransactionId`.
4. Frontend "payment successful" UI is not trusted.

## API

- `GET /api/v1/payments/providers` — configuration status
- `POST /api/v1/payments` — create payment for order (auth)
- `POST /api/v1/payments/:provider/webhook` — provider callbacks
