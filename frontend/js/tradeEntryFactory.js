// tradeEntryFactory.js
import { formatNumber } from './utils.js'; // if needed elsewhere

export function buildTradeEntryFromManualInput(input, account) {
  const entry = Number(input.entry);
  const stop = Number(input.stop);
  const shares = Number(input.shares);
  const target = input.target ? Number(input.target) : null;
  const direction = input.direction === 'short' ? 'short' : 'long';

  const stopDistance = Math.abs(entry - stop);
  const riskDollars = shares * stopDistance;
  const positionSize = shares * entry;
  const riskPercent = account.currentSize > 0
    ? (riskDollars / account.currentSize) * 100
    : 0;

  return {
    ticker: String(input.ticker || '').trim().toUpperCase(),
    direction,
    entry,
    stop,
    originalStop: stop,
    currentStop: stop,
    target,
    shares,
    originalShares: shares,
    remainingShares: shares,
    positionSize,
    riskDollars,
    riskPercent,
    stopDistance,
    notes: input.notes || '',
    status: 'open',
    exitPrice: null,
    exitDate: null,
    pnl: null,
    totalRealizedPnL: 0,
    thesis: null,
    wizardComplete: false,
    wizardSkipped: []
  };
}