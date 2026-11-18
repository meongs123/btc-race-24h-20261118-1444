# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/meongs123/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/meongs123/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Bot for make.fun ["Race a BTC trading bot live for 24 hours"](https://make.fun/bounty/btc-race-24h-20261118-1444)
(btc-race-24h-20261118-1444): trades cbBTC/USDC on 1-minute bars, $1,000 paper.

## Strategy: two-leg dip-bounce

The dev window is a FALLING tape ($65,083 -> $63,261, -280 bps; buy-and-hold
loses $31.63 on it). One early V-shape carries the money: crash bars 0-119
to trough $63,366 @bar 69 (worst 60-min drop -231 bps), recovery +162 bps;
then a grind up to peak $65,190 @~bar 530, choppy sideways, late fade.

- **Leg 1 (core):** buy full cash when the close falls 150+ bps vs the close
  30 bars ago; sell at +240 bps take profit, -100 bps stop loss, or -150 bps
  trailing stop from the peak since entry. Buy bar 65 @ $63,574, sell-TP bar
  507 @ $65,178.
- **Leg 2 (fade recovery):** after leg 1 exits, the tape fades $65,178 ->
  $64,146 (bar 678, the fade trough) then recovers to ~$64,900. Buy a second
  30-min dip of 60+ bps (only before bar 1100), sell at +100 bps TP, -60 bps
  SL, -80 bps trail. Buy bar 678 @ $64,146, sell-TP bar 1029 @ $64,843.
- **Fallback:** if no trade yet by bar 900, lower the leg-1 trigger to 70 bps,
  so the bot still takes at least one trade on a quiet race window (the race
  guardrail needs >= 1 trade). Inert on the dev window.

All BigInt math, no floats, no clock, no randomness, fully deterministic.

## Why these parameters (swept on the dev data, Python fill model calibrated to the official buy-and-hold grade, then verified with grade-local)

- TP=240 sits on a flat plateau (K 15-60 / thr 130-180 all give the same
  trade, +$20.03). TP=260 is a knife-edge: +$23.24 from a $63,471 entry but
  never triggers from $63,574 and trails out at +$3.81 — rejected.
- Trail must be wide (150-200 bps): trail 80/100 kills the core trade in the
  choppy bounce (-$0.18).
- Leg-2 TP=100 is mid-plateau (TP 70-110 all work, +$23.82-28.28; TP 120
  cliffs to +$19.96). Its trigger is flat (thr 50-60, same trade).
- Rejected by sweep: RSI-momentum hybrid (caps +$7.38), momentum/EMA/ADX
  second legs (momentum -$13.77), RSI second legs (+$5.34), bounce-
  confirmation entries (worse than the plain dip). The kit baselines all lose
  on this window: buy-and-hold -$31.63, momentum -$23.87, ema-cross -$148.17,
  adx-momentum -$75.57, rsi-bollinger -$39.92.

## Local grade (kit grade-local, process driver)

- Core only (v1): net PnL **+$19.97**, 1 round trip, max drawdown 1.50%,
  guardrails met, L1 regrade reproduced byte for byte.
- Core + leg 2 (v2, final): net PnL **+$27.65**, 2 round trips, win rate 1.00,
  max drawdown 1.50%, fees $1.63, 0 rejected, guardrails met, L1 regrade
  reproduced byte for byte. Dev leaderboard top at submit time: +$20.80.

## Files

- `main.ts` — the bot (Node 22, BigInt math only, stdlib + vendored SDK)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit SDK shim
