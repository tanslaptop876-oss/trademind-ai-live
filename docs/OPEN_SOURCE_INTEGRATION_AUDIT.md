# External open-source integration audit — 2026-11-18

This is a **read-only source/documentation review**, not evidence that external code was installed, run, benchmarked, merged, or deployed. No exchange/broker credentials were inspected or changed.

## Candidate matrix

| Repository | License observed | Reusable scope | Decision / caveat |
|---|---|---|---|
| [PKScreener](https://github.com/pkjmesra/PKScreener) | MIT (GitHub metadata and LICENSE) | NSE technical scanner, breakout, patterns and screening techniques | **Priority A**: prototype a thin adapter or independently implement feature-compatible rules; avoid wholesale dependency until runtime and data provider behavior tested. Repository is relatively large. |
| [Indian Markets Options Hub](https://github.com/yash-sarawgi/Indian-Markets-Options-Hub) | MIT (LICENSE and package metadata) | Option-chain UI, OI/IV/Greeks/strategy presentation | **Priority A** for reference/UI; broker relays are explicitly incomplete per README. Verify source of each live field before claiming real-time data. |
| [candL](https://github.com/indubitablysrivathsan/candL) | **No top-level LICENSE observed; GitHub repo metadata did not identify a license** | NSE archive -> DuckDB -> FastAPI EOD F&O, FII and delivery pipeline | **Reference only / block code copying** pending explicit license permission and NSE data rights review. ~2–8 GB local disk noted in README, so not for Cloudflare Pages runtime. |
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) | Apache-2.0 | LLM research-agent workflow and point-in-time research architecture | **Priority B**: optional asynchronous research analysis, not intraday execution/prediction source; provider fees, dependencies and non-Indian data assumptions must be evaluated. |
| [Freqtrade](https://github.com/freqtrade/freqtrade) | GPL-3.0 | Crypto strategy research and FreqAI ideas | **Reference / separated service review**; legal assessment before copying GPL components into proprietary SaaS; CoinDCX compatibility unproven. |
| [FrontierTradelight](https://github.com/bedmuthaapoorv/FrontierTradelight) | Apache-2.0 | Plain-language strategy specification, code generation and historical backtesting | **Priority B** for design only until generated-code sandboxing/security is resolved. Never execute LLM-produced Python without review/isolation. |

## Existing TradeMind components to preserve

Frontend `trademind-ai-live`:
- `screener-engine.js`: CSV parse + rule-vote scanner; its historical hit rate is not a trained calibrated probability.
- `backtest-engine.js`: SMA crossover backtesting.
- `functions/api/market-data.js`: Breeze / Upstox / Alpha Vantage data adapters.
- `functions/api/scanner-data.js`: Upstox batch quote snapshots, up to 500 instruments; not 500-symbol ML history.
- `integrations/ai-router/worker.ts`: Gemini, DeepSeek, Groq, OpenRouter; no direct Anthropic provider currently.

Backend `TRADE-MINE-AI`:
- `app/services/indicators.py`, `decision.py`, `pipeline.py`, `backtest.py`, `risk.py`, `paper_trading.py`.
- `app/services/icici_readonly.py`, `upstox_readonly.py`, broker safety/observability services.

## Phased implementation choices

1. **P0 safety contract:** normalize provider timestamps, OHLCV completeness, currency/exchange, market schedule, and stale/delayed flags. Never infer missing OI/volume. Keep execution paper-only and credentials in backend secrets.
2. **P1 MTF + breakout:** extend existing JS scanner with deterministic signals; use closed candles only, session-aware 1m/5m/15m/daily/weekly aggregations, ATR/volume confirmation, and test against fixtures. Reuse PKScreener techniques, not its entire runtime initially.
3. **P2 F&O and institutions:** use an explicitly entitled options-chain API; use Options Hub UI as reference. For candL, implement an independent adapter against permitted public/archive formats after license/data-rights review.
4. **P3 AI research:** investigate TradingAgents in optional async service; prefer existing Python backend and existing AI router. Never treat a language-model narrative as numerical price-probability evidence.
5. **P4 Crypto:** evaluate CoinDCX public candles with native adapter; evaluate FreqAI separately to avoid license and provider incompatibility surprises.

## Acceptance gates (must pass before merging functional integrations)

- Dependency/license review with copyright notices preserved; exchange redistribution rights reviewed.
- Automated unit tests and fixture-based data normalization tests.
- No look-ahead bias: next closed candle entry, chronology-respecting walk-forward splits, dated fundamentals.
- No direct execution of generated strategies; no live order placement.
- Measured data latency, provider throttling, error handling, incomplete candle and holiday behavior.
- Risk/position sizing + costs/slippage in backtests; no accuracy/returns guarantees.

## Audit sources

- https://github.com/pkjmesra/PKScreener (README, LICENSE, setup.py, repository metadata)
- https://github.com/yash-sarawgi/Indian-Markets-Options-Hub (README, LICENSE, package.json)
- https://github.com/indubitablysrivathsan/candL (README, directory listing, requirements.txt, metadata)
- https://github.com/TauricResearch/TradingAgents (README, pyproject.toml, LICENSE)
- https://github.com/freqtrade/freqtrade (repository metadata, GPL-3.0)
- https://github.com/bedmuthaapoorv/FrontierTradelight (README, LICENSE)
