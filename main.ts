// Dip-bounce bot for the BTC race (cbBTC/USDC, 1-minute bars).
//
// Dev window (18 Nov 2026, 1,440 bars): a FALLING tape, $65,083 -> $63,261
// (-280 bps; buy-and-hold loses $31.63 on it). Mean |1m| move 4.0 bps,
// median 2.5 bps, max 64 bps. One early V-shape: crash bars 0-119 to trough
// $63,366 @bar 69 (worst 60-min drop -231 bps), recovery +162 bps; then a
// slow grind up bars 300-539 to peak $65,190 @~bar 530, choppy sideways
// bars 540-1139 ($64,100-64,900), late fade bars 1140-1439 (-110 bps in the
// last hour). Only TWO 60-min drops >= 80 bps in the whole window (bar 60
// -142 bps; bar 1431 -94 bps, a trap: only +29 bps recovery).
//
// Rules (all BigInt, no floats, no clock, no randomness, deterministic):
// - Buy the full cash when the close falls DROP_BPS or more vs the close
//   K_BARS ago (a 30-minute drawdown, not a 1-minute flicker).
// - Sell the whole position at +TP_BPS above the entry close (take profit),
//   -SL_BPS below it (stop loss), or -TRAIL_BPS below the peak close since
//   entry (trailing stop: locks in a bounce that fades before TP).
// - Fallback: if no trade yet by bar 900, lower the trigger to
//   FALLBACK_DROP_BPS, so the bot still takes at least one trade on a quiet
//   race window (the race guardrail needs >= 1 trade). Inert on the dev
//   window (the core trade fires at bar 65).
// - Orders fill at the next bar's open; TP/SL/trail are wide vs the ~26 bps
//   round-trip cost (4 fee + 2 slip + ~7 impact per leg, calibrated so the
//   Python model reproduces the official buy-and-hold grade -$31.63).
//
// Swept on the new dev data (Python fill model, then grade-local):
// core K30/thr150/TP240/SL100/trail150 -> +$20.03 py / +$19.97 official,
// 1 round trip, DD 1.50%.
// The TP=240 plateau is flat across K 15-60 / thr 130-180 (same trade:
// buy bar 65 @ $63,574, sell-TP bar 507 @ $65,178). TP=260 is a knife-edge
// (works only from a $63,471 entry, +$23.24; from $63,574 it never triggers
// and trails out at +$3.81) and is REJECTED. Trail must be wide (150-200):
// trail 80/100 kills the trade in the choppy bounce (-$0.18). RSI-momentum
// caps at +$7.38, momentum/EMA/ADX second legs lose money in the chop.
//
// REVISION (after the first local grade, +$19.97): a second leg. After the
// core trade exits, the tape fades $65,178 -> $64,146 (bar 678, the fade
// trough) then recovers to ~$64,900. A second dip-buy (30-min drop 60 bps,
// TP +100, SL -60, trail -80, only before bar 1100) catches that recovery:
// buy bar 678 @ $64,146, sell-TP bar 1029 @ $64,843, +$7.71 more, total
// +$27.74 py. Leg-2 TP is mid-plateau (TP 70-110 all work, +$23.82-28.28;
// TP 120 cliffs to +$19.96) and its trigger is flat (thr 50-60 same trade).
// Momentum/RSI second legs were swept and REJECTED (momentum -$13.77,
// RSI +$5.34, both worse than core alone). Leg 2 is bounded: worst case it
// hits SL -60 bps (~-$9.60 with costs) and the core profit still stands.

import { runBars, type BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const K_BARS = 30;
const DROP_BPS = 150n;
const FALLBACK_BAR = 901;
const FALLBACK_DROP_BPS = 70n;
const TAKE_PROFIT_BPS = 240n;
const STOP_LOSS_BPS = 100n;
const TRAIL_BPS = 150n;
// Second leg (after the core trade exits): fade-recovery dip-buy.
const LEG2_DROP_BPS = 60n;
const LEG2_MAX_BAR = 1101;
const LEG2_TAKE_PROFIT_BPS = 100n;
const LEG2_STOP_LOSS_BPS = 60n;
const LEG2_TRAIL_BPS = 80n;
const MAX_SLIPPAGE_BPS = 300;
const MIN_NOTIONAL = 1_000_000n;

const closes: bigint[] = [];
let entryPrice: bigint | null = null;
let peakPrice: bigint | null = null;
let hasTraded = false;
let tradable = 0;
let leg = 1;

await runBars({
  onBatch(state: BarsState) {
    if (state.warmingUp) return [];
    tradable += 1;
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    // Bounded history: only the last K_BARS + 1 closes are ever needed
    // (the reference close K bars ago), so drop older bars instead of
    // growing the array for the whole 1,440-bar window.
    if (closes.length > K_BARS + 1) closes.shift();
    const orders: { side: 'buy'; symbol: string; notional_quote_units: bigint; max_slippage_bps: number }[] = [];
    const sells: { side: 'sell'; symbol: string; qty: bigint; max_slippage_bps: number }[] = [];
    const holding = state.positions.get(SYMBOL);
    const inPosition = holding !== undefined && holding.qty > 0n;
    if (closes.length > K_BARS) {
      const ref = closes[closes.length - 1 - K_BARS];
      const dropBps = ((close - ref) * 10000n) / ref;
      if (!inPosition) {
        if (leg === 1) {
          const thr = (!hasTraded && tradable >= FALLBACK_BAR) ? FALLBACK_DROP_BPS : DROP_BPS;
          if (dropBps <= -thr && state.cash >= MIN_NOTIONAL) {
            orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
            entryPrice = close;
            peakPrice = close;
            hasTraded = true;
          }
        } else if (leg === 2 && tradable <= LEG2_MAX_BAR) {
          if (dropBps <= -LEG2_DROP_BPS && state.cash >= MIN_NOTIONAL) {
            orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
            entryPrice = close;
            peakPrice = close;
          }
        }
      } else if (entryPrice !== null && peakPrice !== null) {
        if (close > peakPrice) peakPrice = close;
        const tpBps = leg === 1 ? TAKE_PROFIT_BPS : LEG2_TAKE_PROFIT_BPS;
        const slBps = leg === 1 ? STOP_LOSS_BPS : LEG2_STOP_LOSS_BPS;
        const trBps = leg === 1 ? TRAIL_BPS : LEG2_TRAIL_BPS;
        const tp = close * 10000n >= entryPrice * (10000n + tpBps);
        const sl = close * 10000n <= entryPrice * (10000n - slBps);
        const tr = close * 10000n <= peakPrice * (10000n - trBps);
        if (tp || sl || tr) {
          sells.push({ side: 'sell', symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          entryPrice = null;
          peakPrice = null;
          leg += 1;
        }
      }
    }
    return [...sells, ...orders];
  },
});
