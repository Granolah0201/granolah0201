# RSI(2) Pullback

Buy a sharp dip only while the big trend is up. Daily charts, index ETFs (SPY, QQQ, IWM).

1. **Trend filter:** the daily close is above the 200-day SMA. If not, do nothing.
2. **Entry:** RSI(2) closes below 10. Buy at (or just before) the close.
3. **Exit:** sell on the first close above the 5-day SMA. No stop, no target.

## Files

- `rsi2_pullback.pine`: TradingView indicator (Pine Script v6). Draws the 200-day and
  5-day lines, BUY/SELL labels and a status table, and defines the alerts
  "RSI(2) pullback buy" and "RSI(2) pullback sell". Paste into Pine Editor, Save, Add to chart.
- `rsi2_levels.py`: pulls daily prices from Yahoo Finance and prints, for each ETF, the
  current trend, RSI(2), open trade, and the exact closing prices that would trigger a buy
  or a sell at the next close. Also re-runs the full-history backtest.

```
python3 rsi2_levels.py                 # today's checklist
python3 rsi2_levels.py --json out.json # chart + backtest data as JSON
```

During market hours the script keeps the unfinished day out of the history and shows it as
a live snapshot. Needs network access to `query1.finance.yahoo.com`.

Prices are split-adjusted but not dividend-adjusted, like TradingView's default chart, and
RSI uses Wilder smoothing like TradingView's `ta.rsi()`, so numbers line up with the chart.
