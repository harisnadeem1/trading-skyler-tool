// tradeEntryFactory.js
import { formatNumber } from './utils.js'; // if needed elsewhere

export function buildTradeEntryFromManualInput(input, account) {
  const entry = Number(input.entry || 0);
  const stop = Number(input.stop || 0);
  const shares = Number(input.shares || 0);
  const target = input.target ? Number(input.target) : null;
  const direction = input.direction === 'short' ? 'short' : 'long';

  const stopDistance = Math.abs(entry - stop);
  const riskDollars = shares * stopDistance;
  const positionSize = shares * entry;
  const riskPercent = Number(account?.currentSize) > 0
    ? (riskDollars / Number(account.currentSize)) * 100
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