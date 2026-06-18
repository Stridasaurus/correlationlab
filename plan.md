# Portfolio Correlation Analysis Tool — Build Plan

## Architecture

```
/
├── plan.md
├── data/                      # Generated JSON (gitignored raw, committed output)
│   ├── correlation.json       # Correlation matrix
│   ├── returns.json           # Normalized cumulative returns time series
│   ├── prices.json            # Latest prices + metadata per ticker
│   └── synthetic_flag.json    # Whether synthetic fallback was used
├── scripts/
│   ├── fetch_data.py          # Main data pipeline
│   └── requirements.txt
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── HoldingsTable.tsx  # Editable ticker/quantity table
│   │   ├── CorrelationHeatmap.tsx
│   │   ├── ReturnsChart.tsx
│   │   ├── PortfolioChart.tsx
│   │   └── SummaryStats.tsx
│   ├── lib/
│   │   ├── correlation.ts     # Math utilities (tested)
│   │   └── types.ts
│   └── index.tsx
├── tests/
│   └── correlation.test.ts    # Unit tests for math
├── public/
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Milestones

1. **M1: Repo scaffold** — Vite + React + TypeScript + Tailwind + Recharts, compiles clean
2. **M2: Python data pipeline** — fetch_and_compute(), JSON output, synthetic fallback
3. **M3: Unit tests** — correlation/returns math verified against hand-computed values
4. **M4: Holdings table** — editable, computes weights from quantity × price
5. **M5: Correlation heatmap** — interactive with hover tooltips
6. **M6: Charts** — normalized returns time series + portfolio weighted value
7. **M7: Summary stats + theme toggle** — avg pairwise corr, best/worst pair, dark/light
8. **M8: GitHub Pages** — deploy to gh-pages branch via workflow

## Data Schema

```json
// correlation.json
{
  "tickers": ["VOO", "VXUS", ...],
  "matrix": [[1.0, 0.85, ...], ...],
  "generated_at": "2026-06-18T...",
  "synthetic": false
}

// returns.json
{
  "dates": ["2024-06-18", ...],
  "series": { "VOO": [1.0, 1.01, ...], ... },
  "synthetic": false
}

// prices.json
{
  "tickers": {
    "VOO": { "price": 512.34, "name": "Vanguard S&P 500 ETF", "type": "ETF" },
    ...
  },
  "synthetic": false
}
```

## Design Decisions
- Recharts for charts (lighter than Plotly, better React integration)
- Vite for build (fast, minimal config)
- Dark mode via Tailwind `dark:` classes + `class` strategy
- All data reads from static JSON — no runtime API calls
- fetch_and_compute() accepts tickers + lookback_period, returns structured dict
  ready for JSON serialization — designed for reuse in a future live search feature
