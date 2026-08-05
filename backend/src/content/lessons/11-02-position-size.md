# Position Size Formula

## Why this matters

Position size converts the distance from entry to stop into a controlled account risk. Wider stops require fewer shares.

## Clear explanation

The chart defines invalidation. Your account rules determine position size. Never reverse that order to force a larger trade.

The Ronin framework uses two limits:

- standard maximum planned risk: **0.5% of account equity per trade**
- standard maximum initial position value: **15% of account equity**

Both limits must be respected.

### Formula summary

```text
Maximum Dollar Risk = Account Equity × 0.005
Risk Per Share = Entry Price − Stop Price
Risk-Based Shares = Maximum Dollar Risk ÷ Risk Per Share
Maximum Position Value = Account Equity × 0.15
Allocation-Based Shares = Maximum Position Value ÷ Entry Price
Final Position Size = the smaller of Risk-Based Shares and Allocation-Based Shares
```

### Step 1: Maximum dollar risk

> Account Equity × 0.005

For a $100,000 account, maximum planned risk is $500.

### Step 2: Risk per share

> Entry Price − Stop Price

If entry is $50 and stop is $48.50, risk per share is $1.50.

### Step 3: Risk-based shares

> Maximum Dollar Risk ÷ Risk Per Share

$500 ÷ $1.50 = 333 shares.

### Step 4: Allocation cap

Maximum position value:

> Account Equity × 0.15

$100,000 × 15% = $15,000.

Maximum shares by allocation:

> $15,000 ÷ $50 = 300 shares.

### Final size

Use the smaller result: 300 shares.

Actual planned risk is 300 × $1.50 = $450, or 0.45% of the account.

### Round down

Never round up beyond a risk or allocation limit.

### Currency conversion

When the account base currency differs from the stock currency, use a current conversion rate and include commissions and slippage assumptions.

### How to apply it in real time

Position size is determined by account risk and stop distance, then limited by maximum allocation. The standard Ronin reference is a maximum planned risk of 0.5% of account equity per trade and a maximum initial position value of 15% of account equity. These are maximums, not requirements.

Calculate maximum dollar risk as account equity multiplied by 0.005. Calculate risk per share as entry minus stop for a long trade. Divide maximum dollar risk by risk per share to obtain the risk-based share count.

Separately calculate the allocation-based share count from 15% of equity divided by entry price. Use the smaller number and round down.

This method makes position size adapt to the chart. Wider valid stops produce smaller positions. Tighter valid structures permit larger positions only until the allocation cap is reached.

You never tighten the stop to obtain more shares.

## Real example or short trading story

Assume a $100,000 account, a maximum planned risk of 0.5%, an entry at $50, and a stop at $48.50.

Maximum dollar risk is $500. Risk per share is $1.50, so the risk formula allows 333 shares. But the 15% allocation cap allows only $15,000 of position value, or 300 shares.

You use the smaller number and round down. The final planned loss is $450, not a forced $500.

## Key rules / steps

1. Confirm account equity and the risk percentage allowed by the current regime.
2. Calculate risk per share from planned entry and structural stop.
3. Calculate risk-based shares and round down.
4. Calculate allocation-based shares from the maximum position-value rule.
5. Use the smaller share count.
6. Include commissions, slippage assumptions, and currency conversion when relevant.

**Rule to remember**

> **Calculate the risk before sending the order.**

## Common mistakes

- Choosing the stop from a desired position size instead of invalidation
- Risking 0.5% of the position instead of the account
- Ignoring the 15% allocation cap when the stop is very tight
- Rounding up because the difference appears small
- Increasing risk after a losing streak to recover faster

### Coach's note

Watch for **loss aversion and recency bias**. Recent losses can make valid trades feel dangerous, while recent wins can create overconfidence. Size comes from rules, not recent emotion.

## Practice / Reflection question

### Practice

Build a calculator and verify it manually with ten scenarios. Include low-priced and high-priced stocks, tight and wide stops, and a EUR base account trading USD securities. For each scenario, state which constraint—risk or allocation—determines the final share count.

### Reflection

1. Where does the chart prove the thesis wrong?
2. How does that structural stop determine the position size?
3. What emotional pressure could tempt you to widen the stop, increase risk, or recover losses faster?

### Before you mark this lesson complete

- [ ] I can explain the rule in my own words
- [ ] I can identify valid and rejected examples without seeing the future candles
- [ ] I can name the psychological pressure that threatens this rule
- [ ] I can apply the rule inside the complete Ronin process
