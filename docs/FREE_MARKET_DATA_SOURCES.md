# Free / public market-data source evaluation (TradeMind AI)

Reviewed 2026-11-19. A public GitHub repository being open-source **does not** grant rights to redistribute or sell the market data it downloads. Published providers can rate-limit, change, or block requests. Use source/delay/asOf metadata and fail closed.

## Implemented, opt-in, research-only

| Segment | Endpoint | Provider | Authentication | Resolution | Caveats |
| --- | --- | --- | --- | --- | --- |
| Spot crypto | `GET /api/market-data?symbol=BTCUSDT&type=crypto&mode=live&interval=1min` | [CoinDCX public candles](https://docs.coindcx.com/) | None | Documented 1m/15m/1h/1d | Selected spot pairs only; not tick streaming; data can be delayed, invalid or unavailable; no execution. To explicitly prefer it set `FREE_CRYPTO_SOURCE=coindcx`. |
| Daily FX reference | `GET /api/fx-reference?pair=USDINR` | [Frankfurter v2](https://frankfurter.dev/) | None | Daily reference | **NOT a tradable quote, OHLC candle, or intraday signal input.** The endpoint returns `realtime:false`, `signalEligible:false`, and `hasOHLC:false`. |

The CoinDCX adapter also permits `ETHUSDT`, `BTCINR`, `ETHINR` with fixed mapped pair IDs. Verify current availability with CoinDCX market details. The adapter does not perform order operations. Unsupported candle intervals return an error; do not silently resample from unavailable public data.

FX supports USDINR, EURINR, GBPINR, EURUSD, USDJPY as daily reference rates only; provider underlying data terms apply.

## Investigated; do not silently enable in public SaaS

| Segment | Candidate | License observed | Practical use | Decision |
| --- | --- | --- | --- | --- |
| NSE/BSE equities | [tejhq/tej-bazaar](https://github.com/tejhq/tej-bazaar) | MIT code | EOD OHLCV / historical company-data research | Adapter pending dataset coverage and upstream exchange rights review |
| NSE / indices | [jugaad-py/jugaad-data](https://github.com/jugaad-py/jugaad-data) | No license declared in GitHub metadata at review | NSE archive fetch / research | Reference-only; no code copying pending permission |
| NSE F&O / participants | [candL](https://github.com/indubitablysrivathsan/candL) | No top-level license verified | Local DuckDB EOD archive processing | Reference-only; exchange rights and license review |
| MCX | [RuchiTanmay/mcxlib](https://github.com/RuchiTanmay/mcxlib) | Apache-2.0 code | Research on publicly accessible MCX resources | Do not assume access to real-time, exchange-licensed futures |
| MCX and Indian spot | [NikhilSuthar/indian-market-data](https://github.com/NikhilSuthar/indian-market-data) | MIT code | Historical/spot datasets; check data coverage | Candidate only, no live trading feed promise |
| Crypto multi-exchange | [ccxt/ccxt](https://github.com/ccxt/ccxt) | MIT code | Unified public exchange market-data adapters | Optional future service; rate limits and exchange restrictions apply |
| Forex reference | [lineofflight/frankfurter](https://github.com/lineofflight/frankfurter) | MIT code | Official published daily reference rates | Integrated via provider API; NOT for live FX/Gold signals |
| Gold / Silver bullion | [aswinv90/indian-market-historical-data](https://github.com/aswinv90/indian-market-historical-data) | GitHub license NOASSERTION | Historical research only | Do not redistribute; verify non-commercial restrictions |
| XAUUSD & DXY | Historical-data downloaders, broker data | Depends on source | Research/backtesting | No verified no-key **live tradable** source; no fabricated candles |

## Indian live-data policy

Use authenticated existing **ICICI Breeze** or **Upstox** read-only adapters for permitted equities and derivatives. MCX live futures, option chains and exchange-wide redistribution may require market-data entitlements or paid licensing. Never call these feeds free/real-time until contract and independent live smoke test confirm.

## Integration constraints

- The generic `/api/market-data` endpoint returns candle OHLCV data. The `/api/fx-reference` endpoint returns a **different schema** for non-tradable daily FX reference only.
- Only accept known symbols/provider URLs, cap responses, validate numeric OHLC, remove duplicate candles, include source/time/delay.
- Never conflate free daily FX, delayed broker data, synthetic demo, and exchange-traded live candles.
- Do not create order routes, connect private account endpoints, or surface model confidence without out-of-sample validation.
- Unit tests for the new adapters: `node tests/market-data-free.cjs`. Live provider tests must be separate and opt-in.
