# Apply the Ronin Full Color Palette

## Why this matters

Configure the exact parchment, candle, volume, moving-average, and markup colors used throughout the course.

## Clear explanation

Your TradingView workspace should make the Ronin process easier to see. Indicators support the decision; they do not make the decision.

The Ronin palette is not decoration. It is designed so the chart can be used for hours without losing the ability to distinguish trend, pullback, volume, and key moving averages.

Green and red are reserved for price and volume. Gold is reserved for the daily 8 EMA and important active levels. Dark neutral colors represent larger trend structure.

![Ronin TradingView palette](/api/course/asset/ronin-tradingview-palette.png)

### Canvas

| Element | HEX | Setting |
|---|---:|---|
| Background | `#E9DDCA` | Solid |
| Vertical and horizontal grid | `#D4C4A8` | 30% opacity / 70% TradingView transparency |
| Crosshair | `#5D4037` | 60% opacity |
| Scales text | `#2F2F2F` | Full opacity |
| Scales lines | `#C8B89A` | Subtle |

### Candles

### Up candles

| Element | HEX |
|---|---:|
| Body | `#3D6B4F` |
| Border | `#2A4A38` |
| Wick | `#2A4A38` |

### Down candles

| Element | HEX |
|---|---:|
| Body | `#8B2E2E` |
| Border | `#5C1F1F` |
| Wick | `#5C1F1F` |

Use full opacity with borders and wicks enabled. The colors are deliberately muted so direction is obvious without the chart looking neon.

### Volume

| Element | HEX | Setting |
|---|---:|---|
| Up volume | `#3D6B4F` | 45% transparency |
| Down volume | `#8B2E2E` | 45% transparency |
| Volume average | `#5D4037` | 2 px, roughly 80% opacity |

### Moving averages

| Moving average | HEX | Style |
|---|---:|---|
| Daily 8 EMA | `#B8860B` | 2–3 px; primary line |
| Weekly 8 EMA | `#6E7F68` | 2 px; stepped or normal line |
| Daily 21 EMA | `#2A4A38` | 2 px |
| Daily 50 EMA | `#2F2F2F` | 2 px |
| Daily 200 SMA | `#5D4037` | 2–3 px |

The weekly 8 EMA is intentionally sage rather than gold. If both were gold, the daily momentum line and weekly support line would be confused.

### Markup

| Markup | HEX | Suggested setting |
|---|---:|---|
| Last price line | `#B8860B` | 1 px dotted |
| Entry line | `#3D6B4F` | 2 px dashed |
| Stop / invalidation | `#8B2E2E` | 2 px dashed |
| Breakout line | `#B8860B` | 1–2 px dashed |
| Annotation text | `#2F2F2F` | Full opacity |
| Flat-base border | `#7A674B` | 65–75% opacity |
| Flat-base fill | `#B79C6A` | 90% transparency |
| Pullback-zone border | `#6E7F68` | 55–65% opacity |
| Pullback-zone fill | `#9CAF8B` | 88–90% transparency |

### Watermark

Use `#5D4037` at approximately **8–10% opacity**. It should be visible only when you look for it.

### Save the template

1. Apply the colors in Chart Settings.
2. Configure every indicator under its **Style** tab.
3. Save the chart layout.
4. Save the indicator template as **Ronin Full**.
5. Test the theme on a flat base, a controlled pullback, and a failed breakout.

## Real example or short trading story

The daily 8 EMA and weekly stepped 8 EMA are both gold, so they merge visually. You change the weekly line to sage while keeping the daily 8 EMA aged gold.

Now short-term momentum and higher-timeframe support can be identified instantly. Candle colors remain muted green and oxblood, while the parchment background keeps the Ronin identity.

The palette succeeds only when trend and pattern recognition become easier, not merely when the chart looks branded.

## Key rules / steps

1. **Set the parchment canvas and low-opacity grid.**
2. **Apply muted green bullish candles and oxblood bearish candles.**
3. **Use aged gold for the daily 8 EMA and sage for the weekly stepped 8 EMA.**
4. **Apply the exact 21 EMA, 50 EMA, 200 SMA, volume, and markup colors.**
5. **Test the palette on a flat base, controlled pullback, and failed breakout before saving.**

**Rule to remember**

> The system uses color to create hierarchy. Price comes first, the daily 8 EMA comes second, and everything else stays quiet until it matters.

## Common mistakes

- Using the same color for the daily and weekly 8 EMA
- Choosing branding over candle and trend clarity
- Using opaque drawing fills that hide price

### Coach's note

Watch for **tool dependency**. A clean workspace improves attention, but no indicator can replace market context, price structure, or independent judgment.

## Practice / Reflection question

### Practice

Apply every HEX code exactly, including the separate sage weekly stepped 8 EMA. Test the palette on:

1. A tight flat base
2. A controlled pullback
3. A failed breakout with heavy selling

Do not mark the lesson complete until trend, candle direction, moving-average hierarchy, and volume are clear at a glance.

### Reflection

1. What specific job does this tool or visual setting perform?
2. What decision can it support, and what decision can it never make for you?
3. Does the workspace remain clear enough to read trend, structure, volume, and risk at a glance?

### Before you mark this lesson complete

- [ ] I can explain the rule in my own words
- [ ] I can identify valid and rejected examples without seeing the future candles
- [ ] I can name the psychological pressure that threatens this rule
- [ ] I can apply the rule inside the complete Ronin process
