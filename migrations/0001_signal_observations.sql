-- TradeMind signal observation ledger (append-only; no trade orders).
CREATE TABLE IF NOT EXISTS signal_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  source TEXT NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('BUY','SELL','WAIT')),
  candle_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  candle_close REAL NOT NULL CHECK (candle_close>0),
  rule_version TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(status='UNVERIFIED')
);
CREATE INDEX IF NOT EXISTS idx_signal_observations_time ON signal_observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_observations_symbol ON signal_observations(symbol, timeFrame, candle_at);
