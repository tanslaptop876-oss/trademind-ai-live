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

## Planned forward reconciliation (development only)

Migration `migrations/0002_signal_outcomes.sql` defines a **separate** table for calculated forward outcomes, leaving the initial `signal_observations` table immutable. The pure evaluator is in `signal-forward-outcomes.js`, with tests in `tests/signal-forward-outcomes.cjs`.

For each observation, the evaluator requires:
- Original signal candle timestamp and matching OHLC close to exist in the supplied, sorted candle history
- The signal candle and all subsequent horizon candles explicitly marked `complete:true`
- At least `horizonBars` future candles, so entry occurs at the **next** candle open and measurement ends at the horizon-th candle close
- Configurable illustrative round-trip cost in bps; a BUY/SELL directional result is not a simulated fill

Results are `PENDING` where candles are missing, contradictory or still forming, and `SKIPPED` for WAIT. Only completed horizons produce `EVALUATED`. Every evaluated result is labelled `HISTORICAL_PROVIDER_DATA_NOT_AUDITED` and `executable:false`. The evaluator does **not** yet cross-check exchange sessions, holiday calendars, corporate actions, interval gaps, or broker fills.

**Important:** The migration and pure evaluator are code only. They have not been applied or connected to a scheduler, trusted market-data fetch, D1 write path or production browser. There is no automatic future scoring yet. Future reconciliation must fetch trusted licensed candles server-side and avoid using client-provided closing prices to claim independent verification.
