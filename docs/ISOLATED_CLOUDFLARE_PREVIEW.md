# Isolated Cloudflare Pages preview — Signal-Only MVP

This is an **opt-in, non-production** deployment path. Nothing deploys when code is pushed. Do not point it at the existing live Pages project.

## Status

- Static research dashboard passes isolated Chromium browser smoke QA (mocked crypto candles).
- CoinDCX and Frankfurter public endpoints passed a separate real-network smoke check from a GitHub runner.
- `tests/build-signal-preview.cjs` builds `.preview-package/public` plus `.preview-package/functions/api` with only two non-trading routes: `market-data.js` and `fx-reference.js`.
- Outcome logging, D1 writes, server-side reconciliation, broker order routes and all other functions **are intentionally excluded** from this preview.
- The manual workflow is `.github/workflows/isolated-preview.yml`. It has **not** been dispatched and has not deployed anything.

## Required setup before manual dispatch

1. In Cloudflare, create a **new, dedicated Pages project** whose name contains `-preview-` or `-staging-` (for example `trademind-signals-preview-lab`). Never use the existing live project.
2. Create a narrowly scoped Cloudflare API token authorized to deploy **only that preview project/account**, subject to available Pages token permission scope. Keep the account ID and token in GitHub environment secrets, not source control.
3. In GitHub, create an environment called `trademind-preview` with optional reviewer approval and configure secrets:
   - `TRADEMIND_PREVIEW_CF_API_TOKEN`
   - `TRADEMIND_PREVIEW_CF_ACCOUNT_ID`
4. Run **Actions → TradeMind isolated preview deployment → Run workflow** from the feature branch. Enter the exact dedicated project name and explicitly check `confirm_preview_only`.
5. After deployment, check the returned preview URL and test `/historical-screener.html`, `/api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=15min` and `/api/fx-reference?pair=USDINR`. Never infer an HTTP success before actually checking it.
6. Restrict preview access when sharing externally. Public crypto candle endpoints may be rate-limited; exchange data licensing and resale restrictions still apply.

## Explicit limits and future gates

The preview is **not** a trained AI prediction engine; it is rule-based research. Neither real NSE/BSE broker connectivity nor an actual D1 migration is included. The Breeze UI exists but will fail closed because no ICICI credentials or access-code secrets are configured for this preview. Real broker data must be tested separately with approved entitlements and authenticated protections.

Cloudflare preview deployment, any D1 database creation/migration, secret configuration, or changes to the live Pages site require a distinct authorized action after access is provided. No auto trading should be enabled.
