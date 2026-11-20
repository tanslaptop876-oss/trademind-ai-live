# TradeMind AI MVP

Dependency-free educational multi-asset analysis workspace covering stocks, crypto, MCX commodities and currencies.

## Included

- Responsive multi-asset dashboard and instrument switcher
- Price, SMA 20 and EMA 12 chart
- RSI, MACD, momentum and annualised volatility
- Asset-class-specific editable fundamental inputs
- Adjustable technical/fundamental weighting
- Combined evidence score and plain-language outlook
- Upside, base and downside scenario projection with uncertainty band
- Clear demo-data and non-advisory disclosures
- Validated OHLCV CSV import and downloadable template
- SMA crossover backtesting with costs, return, drawdown, win rate and equity curve
- Position sizing and risk/reward planner
- 1,000-path bootstrap Monte Carlo stress test with percentile range and loss probability
- Multi-asset portfolio allocation, covariance/correlation, diversification and stress scenarios
- Cross-market technical scanner with filtering, ranking and quick instrument loading
- Small-/mid-cap filters, volatility regimes, directional probability and support/resistance levels
- Browser-local watchlist alert rules
- Train/test walk-forward validation with parameter heatmap and overfitting verdict
- Explainable research report with evidence, contradictions, invalidation and text export
- Secure same-origin Cloudflare Pages market-data proxy with normalized OHLCV validation
- Live/intraday vs EOD modes, interval selection, provider quote/P-E metadata and volatility-based decision range
- Data-quality and freshness guardrails, capped model confidence and explicit scenario invalidation
- Browser-local forecast journal with direction accuracy, average price error and Brier-score calibration
- Up-to-500-instrument Upstox batch scanner with mid/small-cap universe CSV import and spread/liquidity scalping filters
- Optional 30/60/120-second scanner polling, NSE weekday-session indicator and rolling snapshot volatility
- Account-risk and 20%-exposure-capped scalping position plans with one-click Risk Planner review
- Browser-local paper-scalping journal with snapshot mark-to-market P&L and stop/target touch alerts
- User-entered trading-cost/slippage assumptions, net expectancy, profit factor, drawdown and paper-journal CSV export

## Secure market-data connection

The included Pages Function is exposed at `/api/market-data`. Configure these server-side secrets/bindings in Cloudflare:

- `MARKET_DATA_BASE_URL` — an HTTPS provider/adapter endpoint that accepts `symbol` and `type`
- `MARKET_API_KEY` — sent to that provider as a Bearer token

For the built-in Alpha Vantage equity adapter, set:

- `MARKET_PROVIDER` — `alpha_vantage`
- `ALPHA_VANTAGE_API_KEY` — your server-side Alpha Vantage API key

The built-in adapter loads equity daily/EOD history and company P/E data. It can also request intraday equity candles when the API key's plan and exchange entitlement permit it. The included BSE demo equities use Alpha Vantage's `.BSE` symbol format. Crypto, FX and MCX still use the normalized generic adapter described below, because market coverage and licensing differ by provider.

For the built-in Upstox NSE equity adapter, set:

- `MARKET_PROVIDER` — `upstox`
- `UPSTOX_ACCESS_TOKEN` — a server-side Upstox access/analytics token

The adapter combines V3 historical/intraday candles with a full-quote snapshot, including volume and best bid/ask spread when available. The three included large-cap equities have NSE instrument keys; an NSE instrument-master sync is still required before claiming full mid-/small-cap coverage. Never place broker tokens in browser code.

For the built-in ICICI Direct Breeze NSE equity adapter, set:

- `MARKET_PROVIDER` — `icici_breeze`
- `ICICI_BREEZE_API_KEY` — Breeze application key (secret)
- `ICICI_BREEZE_SESSION_TOKEN` — current Breeze session token (secret)
- `MARKET_ACCESS_TOKEN` — a separate long random access code required by the public market-data endpoint; enter it in the screener only when refreshing broker data. Do not use the Breeze key or session token as this code.

The adapter requests Breeze Historical Data V2 candles with the server-side application key and session token. The latest available candle is the displayed price, with its timestamp. Fifteen-minute and hourly bars are aggregated from native 5-minute and 30-minute candles; weekly and monthly bars are aggregated from daily candles. The session token must be refreshed according to ICICI Direct's session rules. The bundled Reliance, HDFC Bank and TCS instruments include Breeze stock codes; use ICICI's current instrument master for wider coverage. This integration is read-only and does not expose order-placement endpoints.

### FYERS alternative for the dashboard and historical screener

The dashboard and historical screener support FYERS NSE cash equities without Breeze.
Set these **server-side** Cloudflare bindings:

- `MARKET_PROVIDER=fyers`
- `FYERS_APP_ID` — your FYERS application/client ID
- `FYERS_ACCESS_TOKEN` — a valid FYERS access token
- `MARKET_ACCESS_TOKEN` — a separate random TradeMind access code, never a broker credential

Open `historical-screener.html`, select **FYERS**, enter the separate access
code, and use symbols such as `NSE:RELIANCE-EQ,NSE:HDFCBANK-EQ,NSE:TCS-EQ`.
The selected provider must match the server configuration; the browser cannot
override it. Verify additional symbols against the provider's symbol master.
This flow uses no order endpoints and does not store credentials in the browser.

Supported intervals in this adapter: 1, 5, 15, 30, 60 minutes and daily.
Weekly/monthly remain available for Breeze only. The adapter requests 28 calendar
days for intraday candles or 365 days for daily candles, validates/sorts the
response, requires 35 bars and returns at most 500. Intraday mode also requests a
quote snapshot with its provider timestamp; EOD uses the latest candle close.
These are manual snapshots, not streaming ticks. The latest candle may be
unfinished and old timestamps must not be treated as current market activity.

All FYERS responses use `no-store`. Missing configuration/access codes fail
before contacting FYERS. Rate-limit errors stop the request without automatic
retries. The existing 30-second browser cooldown is per session, not a shared
server rate limiter: for multiple users, add account-wide throttling/caching
before scaling. Each stock uses one history request plus one quote request in
intraday mode. The dashboard uses the same server configuration: enter the
separate TradeMind access code in Connections, select a bundled NSE stock,
then choose Load selected instrument. Test connection verifies access without
replacing the chart. The code stays in the page and is sent only in a request
header, never in the URL or browser storage. Late responses after changing the
instrument, interval or mode are ignored. The Upstox batch scanner remains a
separate flow. Dashboard refreshes have no automatic polling or shared quota
limiter; avoid repeated requests against provider limits.

FYERS documents a free Standard plan with 5 data requests/second,
50/minute and 5,000/day; an account, API app, authentication and applicable
permissions are still required. Published plan limits can change. See
[FYERS plans](https://fyers.in/api-docs/v3/getting-started/plans-and-limits/),
[data API](https://fyers.in/api-docs/v3/api/data-api) and
[official endpoint reference](https://github.com/FyersDev/fyers-skills/blob/master/skills/fyers-trading/references/market-data.md).

Other options: the existing Upstox adapter requires its own account token and
entitlements. For crypto, [Kraken public market-data endpoints](https://support.kraken.com/hc/articles/360000919986-public-endpoint-examples-you-can-try-them-directly-in-a-web-browser-)
do not require an account; they are not an NSE source and are not integrated
here. Public availability does not establish redistribution rights.

Run all regression tests with Node.js 20+ (no dependencies):

```sh
node tests/backtest-engine.cjs
node tests/screener-engine.cjs
node tests/market-data-breeze.cjs
node tests/market-data-fyers.cjs
node tests/screener-provider.cjs
node tests/dashboard-market-data.cjs
```

FYERS tests use mocked provider responses; a deployed smoke test with actual
server credentials remains required. Claude automation is not implemented by
this change; provider setup and a real-data smoke test should precede any
automation consuming the data.

### Upstox mid/small-cap universe scanner

1. Start from `universe-template.csv` and populate current NSE rows with `symbol,name,cap,instrument_key` (`cap` must be `mid` or `small`).
2. Import the CSV in the scalping scanner, then run the live scan.
3. `/api/scanner-data` accepts up to 500 instruments and returns normalized full-quote snapshots. The UI filters and ranks at most the top 50 by volume, spread, day range and directional movement.

This is snapshot polling, not tick-by-tick streaming. Complete coverage requires a maintained NSE/Upstox instrument master and current index classification. Universe-wide historical volatility requires a scheduled, rate-limited candle cache; the current historical module analyzes the selected instrument only.

The provider must return `{ source, delay, currency, asOf, quote, pe, rows }`, where `rows` contains at least 35 `{ date, open, high, low, close, volume }` records. `pe` may be null for non-equities. The adapter receives `symbol`, `type`, `mode` (`live` or `eod`) and `interval`. The function validates inputs and OHLC ranges, limits output to 500 rows, applies a timeout and never exposes the key to the browser.

Deploy through Git integration or Wrangler; Cloudflare does not support dashboard Direct Upload for Pages projects that use Functions.

## Important limitations

Until a licensed provider is configured, prices and histories are illustrative demo data. Forecasts are mathematical scenarios, not guaranteed targets or investment advice. The application can read configured market data but does not place broker orders or provide personalized investment recommendations.

## Run and deploy

Open `index.html` directly. It is a static project and can be deployed on Cloudflare Pages, GitHub Pages, Netlify or any static host without a build command.

## Production roadmap

1. Add licensed exchange/market-data providers and server-side API proxying.
2. Store provider keys only in backend secrets—never in browser JavaScript.
3. Add symbol search, real timestamps, corporate actions and contract rollover handling.
4. Add audited data-quality checks and show source/delay on every quote.
5. Backtest models with walk-forward validation, slippage and fees.
6. Add authentication, saved watchlists and risk limits.
7. Complete legal/compliance review before any public investment-facing release.

