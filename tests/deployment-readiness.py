"""TradeMind pre-deployment checks: SQLite-compatible D1 migrations + static page wiring."""
import re
import sqlite3
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class PageInspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            self.ids.append(values["id"])
        if tag == "script" and "src" in values:
            self.scripts.append(values["src"])

def assert_page_wiring():
    html = (ROOT / "historical-screener.html").read_text(encoding="utf-8")
    js = (ROOT / "historical-screener.js").read_text(encoding="utf-8")
    page = PageInspector()
    page.feed(html)
    assert len(page.ids) == len(set(page.ids)), "Duplicate HTML element ID"
    expected = ["screener-engine.js", "signal-journal.js", "scanner-extensions.js", "historical-screener.js"]
    assert page.scripts == expected, f"Script dependency order unexpectedly changed: {page.scripts}"
    for script in page.scripts:
        assert (ROOT / script).is_file(), f"Missing JS asset: {script}"
    references = re.findall(r"\$\(['\"]([a-zA-Z0-9_-]+)['\"]\)", js)
    for item in references:
        assert item in page.ids, f"Dashboard references missing HTML ID: {item}"
    for name in ["runCryptoMtf", "runNseMtf", "runSignalJournal", "runExtended",
                 "cryptoScan", "liveScan", "signalRows", "journalResults"]:
        assert name in page.ids
    assert "x-signal-log-token" not in html, "Private admin secret must not be exposed in UI"
    print("Static research dashboard wiring, IDs, scripts and no-admin-token checks passed")

def assert_migrations():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for path in ["0001_signal_observations.sql", "0002_signal_outcomes.sql"]:
        db.executescript((ROOT / "migrations" / path).read_text(encoding="utf-8"))
    for path in ["0001_signal_observations.sql", "0002_signal_outcomes.sql"]:
        db.executescript((ROOT / "migrations" / path).read_text(encoding="utf-8"))
    obs = ("CRYPTO|BTCUSDT|15m|COINDCX|2026-11-20T00:00:00.000Z|rules_v1",
           "BTCUSDT", "CRYPTO", "15m", "COINDCX", "BUY",
           "2026-11-20T00:00:00.000Z", "2026-11-20T00:00:10.000Z", 101.0,
           "rules_v1", '{"rsi":51}', "UNVERIFIED")
    insert_obs = """INSERT INTO signal_observations(
      event_key,symbol,market,timeframe,source,signal,candle_at,observed_at,
      candle_close,rule_version,evidence_json,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"""
    db.execute(insert_obs, obs)
    db.execute("INSERT OR IGNORE INTO signal_observations(event_key,symbol,market,timeframe,source,signal,candle_at,observed_at,candle_close,rule_version,evidence_json,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",obs)
    assert db.execute("SELECT COUNT(*) FROM signal_observations").fetchone()[0] == 1
    insert_outcome = """INSERT INTO signal_outcomes(event_key,evaluation_version,horizon_bars,
      entry_at,exit_at,entry_open,exit_close,gross_return,fee_bps,net_return,
      outcome,checked_at,verification) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"""
    outcome = (obs[0], "forward_contiguous_v2", 3,
               "2026-11-20T00:15:00.000Z", "2026-11-20T01:00:00.000Z",
               102.0, 107.0, 0.049, 10.0, 0.048, "WIN",
               "2026-11-20T01:30:00.000Z", "HISTORICAL_PROVIDER_DATA_NOT_AUDITED")
    db.execute(insert_outcome, outcome)
    db.execute(insert_outcome.replace("INSERT INTO", "INSERT OR IGNORE INTO"), outcome)
    assert db.execute("SELECT COUNT(*) FROM signal_outcomes").fetchone()[0] == 1
    try:
        db.execute(insert_outcome, ("unknown-event", *outcome[1:]))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Outcome without parent observation was accepted")
    try:
        db.execute(insert_obs, (*obs[:5], "EXECUTE_BUY", *obs[6:]))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Invalid trade execution signal was accepted")
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    print("D1-compatible SQLite migrations, idempotency, FK and signal constraints passed")

if __name__ == "__main__":
    assert_page_wiring()
    assert_migrations()
