#!/usr/bin/env python3
"""RSI(2) Pullback: today's levels and full-history backtest for SPY, QQQ, IWM.

Rules (daily bars):
  1. Trend filter: close above the 200-day simple moving average.
  2. Entry: RSI(2) closes below 10 -> buy at the close.
  3. Exit: first close above the 5-day simple moving average -> sell at the close.

Prices come from Yahoo Finance daily closes (split-adjusted, not dividend-adjusted,
which matches TradingView's default chart settings). RSI uses Wilder smoothing, the
same as TradingView's ta.rsi().

Usage:
  python3 rsi2_levels.py                 # print today's checklist
  python3 rsi2_levels.py --json out.json # also write chart/backtest data as JSON
"""
import argparse
import datetime as dt
import json
import statistics
import time
import urllib.request

SYMBOLS = ["SPY", "QQQ", "IWM"]
RSI_LEN, BUY_BELOW, TREND_LEN, EXIT_LEN = 2, 10.0, 200, 5
CHART_BARS = 140


def fetch(symbol):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           "?period1=0&period2=4102444800&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.load(r)["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    session = res["meta"]["currentTradingPeriod"]["regular"]
    bars = []
    for i, ts in enumerate(res["timestamp"]):
        if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]):
            continue
        day = dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat()
        bars.append((day, q["open"][i], q["high"][i], q["low"][i], q["close"][i]))
    live = None
    # During market hours the last bar is today's unfinished session: keep it out of the
    # history and report it as a live snapshot instead.
    if res["timestamp"][-1] >= session["start"] and time.time() < session["end"]:
        live = dict(price=round(res["meta"]["regularMarketPrice"], 2),
                    time=res["meta"]["regularMarketTime"])
        bars.pop()
    return bars, live


def sma(values, n):
    out, total = [None] * len(values), 0.0
    for i, v in enumerate(values):
        total += v
        if i >= n:
            total -= values[i - n]
        if i >= n - 1:
            out[i] = total / n
    return out


def rsi(values, n):
    """Wilder RSI. Returns (rsi list, final average gain, final average loss)."""
    out = [None] * len(values)
    gains = [0.0] + [max(values[i] - values[i - 1], 0) for i in range(1, len(values))]
    losses = [0.0] + [max(values[i - 1] - values[i], 0) for i in range(1, len(values))]
    ag, al = sum(gains[1:n + 1]) / n, sum(losses[1:n + 1]) / n

    def value(g, l):
        return 100.0 if l == 0 else 100 - 100 / (1 + g / l)

    out[n] = value(ag, al)
    for i in range(n + 1, len(values)):
        ag = (ag * (n - 1) + gains[i]) / n
        al = (al * (n - 1) + losses[i]) / n
        out[i] = value(ag, al)
    return out, ag, al


def analyse(symbol):
    bars, live = fetch(symbol)
    dates = [b[0] for b in bars]
    close = [b[4] for b in bars]
    trend, fast = sma(close, TREND_LEN), sma(close, EXIT_LEN)
    r, ag, al = rsi(close, RSI_LEN)

    trades, pos = [], None
    for i in range(len(close)):
        if trend[i] is None:
            continue
        if pos is None:
            if close[i] > trend[i] and r[i] < BUY_BELOW:
                pos = i
        elif close[i] > fast[i]:
            e = pos
            trades.append(dict(entry=dates[e], exit=dates[i], ep=round(close[e], 2),
                               xp=round(close[i], 2), ret=round((close[i] / close[e] - 1) * 100, 2),
                               days=i - e, rsi=round(r[e], 1)))
            pos = None

    last = len(close) - 1
    rets = [t["ret"] for t in trades]
    wins = [x for x in rets if x > 0]
    losers = [x for x in rets if x <= 0]
    start = TREND_LEN - 1
    years = (dt.date.fromisoformat(dates[last]) - dt.date.fromisoformat(dates[start])).days / 365.25
    growth = 1.0
    for x in rets:
        growth *= 1 + x / 100
    decades = {}
    for t in trades:
        decades.setdefault(t["entry"][:3] + "0s", []).append(t["ret"])

    # Price levels for the NEXT close (today's 5-day and 200-day averages include today's close).
    prev = close[last]
    trend_level = sum(close[last - (TREND_LEN - 2):]) / (TREND_LEN - 1)   # close must beat this
    exit_level = sum(close[last - (EXIT_LEN - 2):]) / (EXIT_LEN - 1)      # close must beat this
    rs_max = BUY_BELOW / (100 - BUY_BELOW)                                 # RSI < 10  <=>  RS < 1/9
    buy_level = prev - max(0.0, ag / rs_max - al)                          # close must be under this

    open_trade = None
    if pos is not None:
        open_trade = dict(entry=dates[pos], ep=round(close[pos], 2), rsi=round(r[pos], 1),
                          days=last - pos, ret=round((prev / close[pos] - 1) * 100, 2))

    if live:
        x = live["price"]
        g2 = (ag * (RSI_LEN - 1) + max(x - prev, 0)) / RSI_LEN
        l2 = (al * (RSI_LEN - 1) + max(prev - x, 0)) / RSI_LEN
        live.update(r=round(100.0 if l2 == 0 else 100 - 100 / (1 + g2 / l2), 1),
                    s200=round((trend_level * (TREND_LEN - 1) + x) / TREND_LEN, 2),
                    s5=round((exit_level * (EXIT_LEN - 1) + x) / EXIT_LEN, 2))

    return dict(
        symbol=symbol,
        live=live,
        last=dict(d=dates[last], c=round(prev, 2), s200=round(trend[last], 2),
                  s5=round(fast[last], 2), r=round(r[last], 1), above=prev > trend[last],
                  pct200=round((prev / trend[last] - 1) * 100, 2)),
        status="in" if open_trade else "flat",
        open=open_trade,
        calc=dict(ag=ag, al=al, S199=sum(close[last - (TREND_LEN - 2):]),
                  S4=sum(close[last - (EXIT_LEN - 2):]), last=prev,
                  trendLevel=round(trend_level, 2), exitLevel=round(exit_level, 2),
                  buyBelow=round(buy_level, 2)),
        stats=dict(n=len(trades), win=round(len(wins) / len(trades) * 100, 1),
                   avg=round(statistics.mean(rets), 2), avgw=round(statistics.mean(wins), 2),
                   avgl=round(statistics.mean(losers), 2), worst=min(rets), best=max(rets),
                   medhold=statistics.median(t["days"] for t in trades),
                   maxhold=max(t["days"] for t in trades),
                   timeIn=round(sum(t["days"] for t in trades) / (len(close) - TREND_LEN) * 100, 1),
                   cagr=round((growth ** (1 / years) - 1) * 100, 1),
                   bhcagr=round(((close[last] / close[start]) ** (1 / years) - 1) * 100, 1),
                   since=dates[start], first=dates[0],
                   decades={k: dict(n=len(v), win=round(sum(x > 0 for x in v) / len(v) * 100))
                            for k, v in sorted(decades.items())}),
        trades=trades,
        chart=[dict(d=dates[k], o=round(bars[k][1], 2), h=round(bars[k][2], 2),
                    l=round(bars[k][3], 2), c=round(close[k], 2), s200=round(trend[k], 2),
                    s5=round(fast[k], 2), r=round(r[k], 1))
               for k in range(len(close) - CHART_BARS, len(close))],
    )


def checklist(a):
    L, c, o = a["last"], a["calc"], a["open"]
    lines = []
    if a["live"]:
        v = a["live"]
        at = dt.datetime.fromtimestamp(v["time"], dt.timezone.utc).strftime("%H:%M UTC")
        lines.append(f"{a['symbol']}  LIVE {v['price']:.2f} at {at} -> if it closed here: "
                     f"RSI(2) {v['r']:.1f}, 200-day {v['s200']:.2f}, 5-day {v['s5']:.2f}")
    lines += [f"{a['symbol']}  close {L['c']:.2f} on {L['d']}  |  200-day {L['s200']:.2f} "
             f"({L['pct200']:+.2f}%)  5-day {L['s5']:.2f}  RSI(2) {L['r']:.1f}"]
    if o:
        lines.append(f"  IN TRADE since {o['entry']} at {o['ep']:.2f} ({o['ret']:+.2f}%, {o['days']} days)")
        lines.append(f"  -> SELL if the next close is above {c['exitLevel']:.2f}")
    elif not L["above"] and c["trendLevel"] > c["buyBelow"]:
        lines.append(f"  SIT OUT: below the 200-day line (needs a close above {c['trendLevel']:.2f})")
    elif c["buyBelow"] <= c["trendLevel"]:
        lines.append(f"  NO BUY POSSIBLE next close: RSI(2) < 10 needs a close under {c['buyBelow']:.2f}, "
                     f"but the 200-day line is at {c['trendLevel']:.2f}")
    else:
        lines.append(f"  -> BUY if the next close is between {c['trendLevel']:.2f} and {c['buyBelow']:.2f}")
    s = a["stats"]
    lines.append(f"  history since {s['first']}: {s['n']} trades, {s['win']}% winners, "
                 f"avg {s['avg']:+.2f}%, worst {s['worst']:+.2f}%")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", help="write chart and backtest data to this file")
    args = ap.parse_args()
    results = {s: analyse(s) for s in SYMBOLS}
    for s in SYMBOLS:
        print(checklist(results[s]))
        print()
    if args.json:
        with open(args.json, "w") as f:
            json.dump(results, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
