# KV Design

## Namespace

Recommended binding name:

```text
ASSET_KV
```

## Exchange Rates Cache

The Worker cron task writes one value per day to a stable KV key:

```text
exchange_rates
```

Value shape:

```json
{
  "base": "CNY",
  "rates": {
    "CNY": 1,
    "USD": 0.14,
    "HKD": 1.09,
    "EUR": 0.13,
    "JPY": 22.16
  },
  "updated_at": "2026-06-23",
  "source": "open.er-api.com",
  "fetched_at": "2026-06-23T02:00:00.000Z"
}
```

For compatibility with a minimal UI, the Worker can also flatten rates before returning them:

```json
{
  "CNY": 1,
  "USD": 0.14,
  "HKD": 1.09,
  "updated_at": "2026-06-23"
}
```

## Conversion Rules

Rates are CNY-based:

```text
1 CNY = rates[currency] currency
```

Convert any currency amount to CNY:

```text
amount_cny = currency == "CNY" ? amount : amount / rates[currency]
```

Display a CNY total as another currency:

```text
display_amount = currency == "CNY" ? amount_cny : amount_cny * rates[currency]
```

## Failure Behavior

If the daily exchange-rate API request fails:

- keep the existing `exchange_rates` value unchanged;
- log a structured warning with the source, HTTP status or error message, and scheduled time;
- let API reads continue using the last successful cache;
- if no cache exists yet, the backend should fall back to `{ "base": "CNY", "rates": { "CNY": 1 } }`.
