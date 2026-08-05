# Low-of-Day ATR Efficiency

## Why this matters

Low-of-Day ATR distance measures how far your planned entry has already moved from the day’s low compared with the stock’s normal daily range.

## Clear explanation

A 30-minute trigger is valid only after the higher-timeframe setup is complete. Speed does not repair weak structure.

A setup can be correct while the entry is too late. The low-of-day ATR rule measures how far price has moved from the day’s low relative to the stock’s normal daily movement.

### Formula

> **LOD ATR % = (Entry Price − Low of Day) ÷ Daily ATR × 100**

The ATR always comes from the daily chart, even when the trigger appears on the 30-minute chart.

### Preferred threshold

The Ronin framework generally prefers the entry-to-low-of-day distance below approximately **60% of daily ATR**.

Example:

- Entry: $102
- Low of day: $100
- Daily ATR: $4

LOD ATR % = (102 − 100) ÷ 4 × 100 = 50%

The entry remains within the preferred range.

If entry is $103, the distance becomes 75%, which is less efficient.

### What the rule means

It is an entry-location filter. It does not mean the low of day must always be the stop. The structural stop may be above or below it depending on the setup.

### Why it helps

- prevents chasing
- keeps entries closer to support
- improves position-sizing flexibility
- reduces the chance of buying after most of the daily move is complete
- provides a consistent comparison across volatile stocks

### Limitations

A low LOD distance does not make a weak setup valid. A stock can be close to the low of day while breaking down. Context and confirmation remain primary.

### How to apply it in real time

Low-of-Day ATR percentage measures how far the planned entry has moved from the current day’s low relative to the stock’s normal daily range. It answers a specific question: has the stock already used too much of its normal movement before you enter?

The formula is: `(Entry − Low of Day) ÷ Daily ATR × 100`. The system prefers entries at approximately 60% of daily ATR or less from the low of day. This is a preference and filter, not a promise that entries above 60% fail.

It protects against paying up after a large intraday expansion and then placing the stop at a location the stock can reach through normal noise.

The daily ATR is used even when the trigger is on the 30-minute chart. The low of day is current and can change as the session develops. Therefore, the metric should be recalculated immediately before entry.

It is separate from actual risk, which is measured from entry to the structural stop.

## Real example or short trading story

Suppose your entry is $102, the Low of Day is $100, and daily ATR is $4.

The distance is $2. Dividing $2 by $4 gives **50% of daily ATR**, which remains inside the Ronin preference of approximately 60% or less.

If the entry rises to $103 while the Low of Day stays $100, the distance becomes 75% of ATR. The stock may still go higher, but the entry is no longer as efficient.

## Key rules / steps

1. Read the current daily ATR from a consistent lookback, commonly 14 days.
2. Identify the current regular-session low of day.
3. Calculate the entry-to-low distance in price.
4. Divide by daily ATR and convert to a percentage.
5. Prefer approximately 60% or less; become increasingly selective as the value rises.
6. Reject the trade rather than inventing a higher stop to improve the number.

**Rule to remember**

> **A good stock can become a bad entry when it is too far from the low of day.**

## Common mistakes

- Using the trigger to justify chasing an already extended entry
- Using intraday ATR instead of daily ATR in the denominator
- Confusing LOD ATR percentage with account risk
- Freezing the morning low after a new low forms
- Entering above the threshold because the stock “looks too strong to miss.”

### Coach's note

Watch for **hesitation and impulse**. A planned trigger can produce fear before entry and urgency after it moves. Rehearsed rules reduce both freezing and chasing.

## Practice / Reflection question

### Practice

Build a spreadsheet with entry, low of day, daily ATR, LOD ATR percentage, and outcome for at least fifty trades. Group results into 0–20%, 20–40%, 40–60%, and above 60%. Evaluate expectancy and adverse excursion by bucket.

Keep the rule process-first; do not optimize it to a tiny sample.

### Reflection

1. What is the exact trigger, and which higher-timeframe setup gives it meaning?
2. At what price would the entry become too extended under the Ronin rules?
3. What pre-entry step will stop hesitation or impulse from changing the plan?

### Before you mark this lesson complete

- [ ] I can explain the rule in my own words
- [ ] I can identify valid and rejected examples without seeing the future candles
- [ ] I can name the psychological pressure that threatens this rule
- [ ] I can apply the rule inside the complete Ronin process
