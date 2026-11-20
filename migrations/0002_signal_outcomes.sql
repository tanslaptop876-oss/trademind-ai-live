-- Optional forward outcome results: separate from immutable client-reported observations.
-- Apply after 0001_signal_observations.sql.
CREATE TABLE IF NOT EXISTS signal_outcomes (
  event_key TEXT PRIMARY KEY NOT NULL,
  evaluation_version TEXT NOT NULL,
  horizon_bars INTEGER NOT NULL CHECK(horizon_bars>=1 AND horizon_bars<=100),
  entry_at TEXT NOT NULL,
  exit_at TEXT NOT NULL,
  entry_open REAL NOT NULL CHECK(entry_open>0),
  exit_close REAL NOT NULL CHECK(exit_close>0),
  gross_return REAL NOT NULL,
  fee_bps REAL NOT NULL CHECK(fee_bps>=0 AND fee_bps<=500),
  net_return REAL NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('WIN','LOSS','FLAT')),
  checked_at TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'HISTORICAL_PROVIDER_DATA_NOT_AUDITED'
    CHECK(verification='HISTORICAL_PROVIDER_DATA_NOT_AUDITED'),
  FOREIGN KEY(event_key) REFERENCES signal_observations(event_key)
);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_checked_at ON signal_outcomes(checked_at DESC);
