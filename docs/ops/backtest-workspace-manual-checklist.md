# Backtest Workspace Manual Checklist

Use this checklist for route-level regression passes after changing `/backtests`, `backtestApi`, or the control-plane backtest endpoints.

## Route and Navigation

- Open `/backtests` from `LIVE OPERATIONS -> STRATEGY SETUP`; the page should default to run review on the Overview tab, not the configure or replay workflow.
- Open `/backtests?strategy=<strategyName>` from a strategy workspace deep link; the run rail and draft config should carry the strategy filter.
- Confirm the left navigation keeps `/strategies` and `/backtests` as separate entries and does not expose hidden compatibility routes for universes or rankings.
- Resize to tablet and phone widths; left rail, center dossier, and right rail should stack without overlapping text, controls, or charts.

## Run Library

- Search by strategy, run id, execution name, owner, benchmark, cost model, schema version, or status where those fields are present.
- Toggle status filters for queued, running, succeeded, failed, cancelled, and unknown runs.
- Select a run and refresh; the selected run id should persist in the URL and restore the same dossier when the run is still present.
- Verify empty, loading, error, failed-run, and truncated-history states are visible and actionable.

## Configuration and Validation

- Build a draft with strategy reference, date range, cash, benchmark, bar size, cost model, commission, slippage/spread, market impact, borrow/financing, participation cap, latency/delay, and liquidity filters.
- Validate the draft before launch; pass, warn, and block verdicts should render with severity, evidence, blocked reasons, duplicate-run evidence, and inflight-run reuse when returned by the backend.
- Launch a valid draft; the UI should call the run endpoint and move the operator to the new or reused run without implying a completed result before the backend publishes one.
- Confirm validation and launch failures show backend error text without losing the current draft.

## Run Dossier

- Confirm Overview prioritizes net return, gross return, drawdown, Sharpe, Sortino, Calmar, turnover, cost drag, exposure, hit rate, payoff, expectancy, and warnings before raw return detail.
- Confirm provenance shows data snapshot, vendor/source, load id, schema version, adjustment policy, symbol map version, corporate-action state, coverage/null/gap/stale/quarantine status, and warning evidence when present.
- Confirm no browser-only calculation is shown as canonical performance; metrics should be backend-owned fields from summary, detail, attribution, or replay responses.

## Performance, Trades, and Positions

- In Performance, verify equity/drawdown and rolling metric charts render with fallbacks for missing, empty, loading, and error responses.
- In Trades, verify side/status/symbol/date filters, pagination, price, quantity, fees, gross/net PnL, return, and signal fields.
- In Positions, verify closed-position rows show entry/exit timing, holding period, gross/net PnL, return, MFE/MAE, exit reason, and cost fields.

## Replay

- Step backward and forward, use play/pause, change speed, and drag the scrubber; cursor movement should be deterministic and controls should disable when replay data is absent.
- Filter by symbol and jump to largest loss, largest win, max drawdown, cost spike, and limit breach when matching events exist.
- Confirm replay labels distinguish `simulated`, `broker_fill`, `portfolio_ledger`, and `unknown` sources. The UI must never imply real execution unless the replay event source is `broker_fill`.
- Verify before/after cash, positions, exposure, rule id, source evidence, and warnings are readable at each event.

## Diagnostics and Comparison

- Review validation report, provenance, run hashes, pins, schema version, owner, execution name, result links, and warnings.
- Compare two or more runs with matching assumptions and with intentionally different assumptions. Differing assumptions should render alignment warnings and no winner.
- Confirm blocked comparison states are shown for missing, unpublished, or incompatible runs.

## Accessibility

- Navigate tabs, run rail, validation actions, replay controls, filters, and tables with the keyboard.
- Confirm focus outlines are visible and controls have accessible labels.
- Confirm charts have readable empty/fallback states and tables remain usable with screen-reader-friendly headers.
