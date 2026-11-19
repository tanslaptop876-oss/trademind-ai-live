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

## Forward outcome data-integrity gate (v2)

`signal-forward-outcomes.js` now requires the evaluator to be called with explicit `market` and `timeframe` settings. Supported reconciliation is deliberately limited to `CRYPTO`, `NSE`, or `BSE` with 1m, 3m, 5m, 15m, 30m or 1h source bars. All candle timestamps from the observed bar through the entire forward horizon must be exactly one expected interval apart. NSE/BSE bars must also fall within **one** regular weekday session between 09:15 and 15:30 IST. These are safety restrictions, **not** a full exchange holiday/calendar verification.

Any missing bar, unsupported timeframe, overnight crossing, or unknown source quality leads to `PENDING`, not WIN or LOSS. Daily/weekly/monthly reconciliation is intentionally disabled until exchange calendars and expected session dates are implemented. Even an `EVALUATED` result uses provider-returned historical candles and is **not audited exchange truth**.

This remains a pure-function evaluator plus an unexecuted D1 schema. There is no background job, no database write of evaluated outcomes, no broker trade, and no verified production data source enabled by this change.

## Admin-only CoinDCX outcome preview (development; no persistence)

`functions/api/outcome-preview.js` is a **read-only** server endpoint intended for trusted administrative workflows, not for browser-public invocation.

Request: `GET /api/outcome-preview?event_key=<encoded_event_key>&horizon=5&fee_bps=10` with server-side `x-signal-log-token` header. Requirements:
- Bound D1 `SIGNAL_DB` with a preexisting recorded observation; secret `SIGNAL_LOG_TOKEN` at least 24 characters
- Observation must have `market=CRYPTO`, `source=COINDCX`, a supported symbol (BTCUSDT, ETHUSDT, BTCINR, ETHINR), and a supported timeframe (1m, 15m, 1h or daily)
- Uses the server's own CoinDCX public-candle adapter instead of trusting user-supplied future candles
- Explicitly marks a candle complete only after its timeframe duration plus a conservative 60-second guard
- The existing `signal-forward-outcomes.js` evaluator checks original close, enough forward bars, interval continuity and no-lookahead entry at next-bar open
- Daily outcomes remain `PENDING` because calendar validation is not enabled
- Unsupported cases and upstream failures fail closed (no fabricated accuracy)
- Response includes `persisted:false`, `noOrders:true`, and unverified-provider disclosure; **no D1 writes or order routing occur**

This is **not independently verified exchange history**, a production accuracy statistic, a scheduled job, or a proven live prediction service. A shared admin secret is still not safe for an untrusted multi-tenant public application. Verify public exchange API availability, license/rate limits, D1 binding, route security, and actual browser behavior before deployment.

Tests: `node tests/outcome-preview.cjs`, included in GitHub Actions. Its CoinDCX response and database are mocked.
