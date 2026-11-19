# Signal observations ledger (opt-in; not yet deployed)

Signal-Only MVP research log; this stores **client-reported, unverified observations**, not trades or independently scored outcomes. No orders, broker execution, market-data credentials, or API-key access from the browser are part of this feature.

## Provisioning

1. Create a Cloudflare D1 database for the app and bind it to the Pages Function as `SIGNAL_DB` (do not assume binding exists).
2. Execute `migrations/0001_signal_observations.sql` against that database through your normal reviewed migration workflow.
3. Create a strong unique secret `SIGNAL_LOG_TOKEN` (at least 24 characters) on the server side.
4. Use the authenticated API **only from a trusted server/admin integration**, never expose `SIGNAL_LOG_TOKEN` in browser HTML, JS, URL, logs, screenshots, or user-facing clients.
5. This development branch is not production. Before any public release, replace the shared token with authenticated per-user, per-tenant identity and rate limiting, and require independently computed server-side observations.

## API

- `POST /api/signal-observations` requires `x-signal-log-token` and a JSON object containing:
  `symbol`, `market`, `timeframe`, `source`, `signal`, `candleAt` (UTC ISO timestamp), `candleClose` (positive finite number), `ruleVersion`, and `evidence` (small flat scalar object).
- `GET /api/signal-observations?limit=50` requires the same secret and returns at most 200 most recently observed records.
- Event IDs are deterministic over market + symbol + timeframe + source + candle timestamp + rule version. Duplicate events are ignored rather than rewritten.
- All saved rows are `status='UNVERIFIED'`; no win/loss figures are asserted.
- No API to submit orders, prices of fills, or authentication to a broker.

The SQL migration and API are written but **database binding, migration execution, secret configuration, and live smoke testing have not been performed**. The historical in-browser journal is a separate retrospective research tool and does not imply persistent storage.

## Safety and limitations

The current POST takes client-provided OHLC close and direction, which can be fabricated by any holder of the shared secret. Do not advertise its records as audited, official real-time, or proof of trading performance. Future phases: signed exchange feed identifiers, server-side signal generation, trusted clock/watermarks, tenant scoping, true outcome reconciliation, privacy and retention policy.

Tests: `node tests/signal-observations.cjs` (mock D1, auth and dedupe). Cloudflare deployment integration must be tested separately.
