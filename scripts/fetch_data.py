"""
Portfolio data pipeline.

Public API:
    fetch_and_compute(tickers, lookback_period) -> dict
        Returns structured data ready for JSON serialization.
        Designed for reuse in future live ticker-search features.
"""

from __future__ import annotations

import json
import math
import os
import random
import sys
import traceback
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

TICKER_META: dict[str, dict[str, str]] = {
    "VXUS":  {"name": "Vanguard Total International Stock ETF", "type": "ETF"},
    "VOO":   {"name": "Vanguard S&P 500 ETF", "type": "ETF"},
    "TRBCX": {"name": "T. Rowe Price Blue Chip Growth Fund", "type": "Mutual Fund"},
    "PRFDX": {"name": "T. Rowe Price Equity Income Fund", "type": "Mutual Fund"},
    "PRNHX": {"name": "T. Rowe Price New Horizons Fund", "type": "Mutual Fund"},
}


# ---------------------------------------------------------------------------
# Core reusable function
# ---------------------------------------------------------------------------

def fetch_and_compute(
    tickers: list[str],
    lookback_period: str = "2y",
) -> dict[str, Any]:
    """
    Fetch historical daily closes for tickers and compute correlation/returns.

    Args:
        tickers: List of ticker symbols (ETFs or mutual funds).
        lookback_period: yfinance period string, e.g. "2y", "1y", "6mo".

    Returns:
        {
            "correlation": {"tickers", "matrix", "generated_at", "synthetic"},
            "returns":     {"dates", "series", "synthetic"},
            "prices":      {"tickers": {ticker: {price, name, type}}, "synthetic"},
            "synthetic":   bool,
        }
    """
    synthetic = False
    try:
        import yfinance as yf
        import pandas as pd

        raw = yf.download(
            tickers,
            period=lookback_period,
            auto_adjust=True,
            progress=False,
            threads=True,
        )

        # yfinance returns MultiIndex columns when multiple tickers requested
        if isinstance(raw.columns, pd.MultiIndex):
            closes = raw["Close"].copy()
        else:
            closes = raw[["Close"]].copy()
            closes.columns = tickers

        # Drop columns that are all-NaN (failed downloads)
        closes = closes.dropna(axis=1, how="all")
        # Forward-fill gaps (mutual funds have no weekend data = fine)
        closes = closes.ffill().dropna()

        available = list(closes.columns)
        if not available:
            raise ValueError("No data returned for any ticker")

        print(f"[fetch_data] Live mode — tickers with data: {available}", file=sys.stderr)

        # If some tickers failed silently, warn
        missing = [t for t in tickers if t not in available]
        if missing:
            print(f"[fetch_data] WARNING: no data for {missing}", file=sys.stderr)

        tickers = available
        closes_dict = {t: closes[t].tolist() for t in tickers}
        dates = [d.strftime("%Y-%m-%d") for d in closes.index]
        latest_prices = {t: float(closes[t].iloc[-1]) for t in tickers}

    except Exception as exc:
        print(f"[fetch_data] yfinance failed ({exc}), using synthetic fallback", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        synthetic = True
        dates, closes_dict, latest_prices = _synthetic_data(tickers, lookback_period)

    # --- Correlation matrix ---
    daily_returns = {t: _daily_returns(closes_dict[t]) for t in tickers}
    corr_matrix = _correlation_matrix(tickers, daily_returns)

    # --- Normalized cumulative returns ---
    norm_returns = {
        t: _normalized_cumulative(closes_dict[t]) for t in tickers
    }

    now = datetime.utcnow().isoformat() + "Z"
    return {
        "correlation": {
            "tickers": tickers,
            "matrix": corr_matrix,
            "generated_at": now,
            "synthetic": synthetic,
        },
        "returns": {
            "dates": dates,
            "series": norm_returns,
            "synthetic": synthetic,
        },
        "prices": {
            "tickers": {
                t: {
                    "price": latest_prices[t],
                    "name": TICKER_META.get(t, {}).get("name", t),
                    "type": TICKER_META.get(t, {}).get("type", "Unknown"),
                }
                for t in tickers
            },
            "synthetic": synthetic,
        },
        "synthetic": synthetic,
    }


# ---------------------------------------------------------------------------
# Math helpers
# ---------------------------------------------------------------------------

def _daily_returns(prices: list[float]) -> list[float]:
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def _normalized_cumulative(prices: list[float]) -> list[float]:
    if not prices:
        return []
    base = prices[0]
    return [p / base for p in prices]


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs)


def _std(xs: list[float]) -> float:
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _pearson(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return float("nan")
    ma, mb = _mean(a), _mean(b)
    sa, sb = _std(a), _std(b)
    if sa == 0 or sb == 0:
        return float("nan")
    cov = sum((a[i] - ma) * (b[i] - mb) for i in range(len(a))) / len(a)
    return cov / (sa * sb)


def _correlation_matrix(tickers: list[str], returns: dict[str, list[float]]) -> list[list[float]]:
    n = len(tickers)
    matrix: list[list[float]] = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                row.append(1.0)
            else:
                row.append(_pearson(returns[tickers[i]], returns[tickers[j]]))
        matrix.append(row)
    return matrix


# ---------------------------------------------------------------------------
# Synthetic fallback
# ---------------------------------------------------------------------------

def _lookback_days(period: str) -> int:
    mapping = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 252, "2y": 504, "5y": 1260}
    return mapping.get(period, 504)


def _synthetic_data(
    tickers: list[str],
    lookback_period: str,
) -> tuple[list[str], dict[str, list[float]], dict[str, float]]:
    """Generate synthetic price series with realistic correlation structure."""
    rng = random.Random(42)
    n_days = _lookback_days(lookback_period)

    # Business days
    end = date.today()
    bdays: list[str] = []
    d = end - timedelta(days=int(n_days * 1.5))
    while len(bdays) < n_days and d <= end:
        if d.weekday() < 5:
            bdays.append(d.strftime("%Y-%m-%d"))
        d += timedelta(days=1)

    # Correlation structure: equity ETFs/funds are all quite correlated
    # Factor model: common market factor + idiosyncratic noise
    base_prices = {"VXUS": 65.0, "VOO": 500.0, "TRBCX": 180.0, "PRFDX": 35.0, "PRNHX": 90.0}
    factor_loadings = {"VXUS": 0.85, "VOO": 0.95, "TRBCX": 0.90, "PRFDX": 0.75, "PRNHX": 0.88}

    # Generate market factor
    market_returns = [rng.gauss(0.0003, 0.008) for _ in range(n_days - 1)]

    closes_dict: dict[str, list[float]] = {}
    latest_prices: dict[str, float] = {}

    for t in tickers:
        start_price = base_prices.get(t, 100.0)
        loading = factor_loadings.get(t, 0.85)
        idio_vol = 0.006 * (1 - loading)

        prices = [start_price]
        for r_m in market_returns:
            ret = loading * r_m + rng.gauss(0.0001, idio_vol)
            prices.append(prices[-1] * (1 + ret))

        closes_dict[t] = prices
        latest_prices[t] = prices[-1]

    return bdays, closes_dict, latest_prices


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fetch portfolio data and write JSON")
    parser.add_argument(
        "--tickers",
        nargs="+",
        default=["VXUS", "VOO", "TRBCX", "PRFDX", "PRNHX"],
    )
    parser.add_argument("--period", default="2y")
    parser.add_argument(
        "--out-dir",
        default=str(Path(__file__).parent.parent / "data"),
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[fetch_data] Fetching {args.tickers} period={args.period}", file=sys.stderr)
    result = fetch_and_compute(args.tickers, args.period)

    mode = "SYNTHETIC" if result["synthetic"] else "LIVE"
    print(f"[fetch_data] Mode: {mode}", file=sys.stderr)

    (out_dir / "correlation.json").write_text(json.dumps(result["correlation"], indent=2))
    (out_dir / "returns.json").write_text(json.dumps(result["returns"], indent=2))
    (out_dir / "prices.json").write_text(json.dumps(result["prices"], indent=2))

    print("[fetch_data] Done — wrote correlation.json, returns.json, prices.json", file=sys.stderr)
