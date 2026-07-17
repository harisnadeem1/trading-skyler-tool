import { subscribeToTradeUpdates } from './marketStream.js';

const connectionStatus = document.getElementById('connectionStatus');
const tradeGrid = document.getElementById('tradeGrid');
const eventLog = document.getElementById('eventLog');
const clearLogBtn = document.getElementById('clearLogBtn');
const backendUrlText = document.getElementById('backendUrlText');
const streamUrlText = document.getElementById('streamUrlText');

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const BACKEND_BASE_URL = isLocal
  ? 'http://localhost:3000'
  : window.location.origin;

const STREAM_URL = `${BACKEND_BASE_URL}/api/market/stream`;

const tradesById = new Map();
let unsubscribeTradeUpdates = null;

backendUrlText.textContent = BACKEND_BASE_URL;
streamUrlText.textContent = STREAM_URL;

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function addLog(message) {
  const item = document.createElement('div');
  item.className = 'log-item';
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  eventLog.prepend(item);
}

function getValidTargetPrice(trade) {
  const target = toFiniteNumber(trade.targetPrice);
  if (target === null || target <= 0) return null;
  return target;
}

function getValidFiveRPrice(trade) {
  const fiveR = toFiniteNumber(trade.fiveRPrice);
  if (fiveR === null || fiveR <= 0) return null;
  return fiveR;
}

function getEffectiveTargetPrice(trade) {
  const target = getValidTargetPrice(trade);
  const fiveR = getValidFiveRPrice(trade);

  if (target !== null) return target;
  if (fiveR !== null) return fiveR;
  return null;
}

function getProgressPercent(entryPrice, targetPrice, currentPrice, direction) {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(targetPrice) ||
    !Number.isFinite(currentPrice)
  ) {
    return 0;
  }

  let rawProgress;

  if (direction === 'short') {
    const totalMove = entryPrice - targetPrice;
    if (!Number.isFinite(totalMove) || totalMove <= 0) return 0;
    const currentMove = entryPrice - currentPrice;
    rawProgress = (currentMove / totalMove) * 100;
  } else {
    const totalMove = targetPrice - entryPrice;
    if (!Number.isFinite(totalMove) || totalMove <= 0) return 0;
    const currentMove = currentPrice - entryPrice;
    rawProgress = (currentMove / totalMove) * 100;
  }

  return Math.max(0, Math.min(100, rawProgress));
}

function getTradeBadge(trade) {
  const hasRealTarget = getValidTargetPrice(trade) !== null;
  const currentR = toFiniteNumber(trade.currentR);

  if (trade.stopHit) {
    return { label: 'Stop Hit', className: 'pill pill--red' };
  }

  if (hasRealTarget && trade.targetHit) {
    return { label: 'Target Hit', className: 'pill pill--green' };
  }

  if (!hasRealTarget && currentR !== null && currentR >= 5) {
    return { label: '5R Hit', className: 'pill pill--green' };
  }

  return { label: 'Live', className: 'pill pill--blue' };
}

function renderTrades() {
  if (!tradesById.size) {
    tradeGrid.innerHTML = '<div class="empty-state">No live trade updates yet.</div>';
    return;
  }

  const cards = Array.from(tradesById.values()).map((trade) => {
    const pnl = toFiniteNumber(trade.unrealizedPnL);
    const pnlClass = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'neu';

    const entryPrice = toFiniteNumber(trade.entryPrice);
    const currentPrice = toFiniteNumber(trade.currentPrice);
    const validTargetPrice = getValidTargetPrice(trade);
    const validFiveRPrice = getValidFiveRPrice(trade);
    const effectiveTargetPrice = getEffectiveTargetPrice(trade);

    const progress = getProgressPercent(
      entryPrice,
      effectiveTargetPrice,
      currentPrice,
      trade.direction
    );

    const targetDisplay =
      validTargetPrice !== null
        ? formatNumber(validTargetPrice, 4)
        : (validFiveRPrice !== null
            ? `${formatNumber(validFiveRPrice, 4)} (5R)`
            : '-');

    const badge = getTradeBadge(trade);

    return `
      <article class="trade-card">
        <div class="trade-card__top">
          <div>
            <h3>${trade.symbol}</h3>
            <p>${String(trade.direction || '').toUpperCase()} · ${trade.status}</p>
          </div>
          <div class="${badge.className}">
            ${badge.label}
          </div>
        </div>

        <div class="price-line">
          <span>Current Price</span>
          <strong>${formatNumber(trade.currentPrice, 4)}</strong>
        </div>

        <div class="metric-grid">
          <div class="metric"><span>Entry</span><strong>${formatNumber(trade.entryPrice, 4)}</strong></div>
          <div class="metric"><span>Stop</span><strong>${formatNumber(trade.stopPrice, 4)}</strong></div>
          <div class="metric"><span>Target</span><strong>${targetDisplay}</strong></div>
          <div class="metric"><span>5R Price</span><strong>${validFiveRPrice === null ? '-' : formatNumber(validFiveRPrice, 4)}</strong></div>
          <div class="metric"><span>Shares</span><strong>${formatNumber(trade.shares, 4)}</strong></div>
          <div class="metric"><span>Remaining</span><strong>${formatNumber(trade.remainingShares, 4)}</strong></div>
          <div class="metric"><span>P&L</span><strong class="${pnlClass}">${formatNumber(trade.unrealizedPnL, 2)}</strong></div>
          <div class="metric"><span>P&L %</span><strong class="${pnlClass}">${formatNumber(trade.unrealizedPnLPercent, 2)}%</strong></div>
          <div class="metric"><span>Current R</span><strong>${formatNumber(trade.currentR, 4)}</strong></div>
          <div class="metric"><span>Risk $</span><strong>${formatNumber(trade.riskDollars, 2)}</strong></div>
        </div>

        <div class="progress-block">
          <div class="progress-label">
            <span>Progress to target / 5R</span>
            <span>${formatNumber(progress, 1)}%</span>
          </div>
          <div class="progress">
            <div class="progress__bar" style="width:${progress}%"></div>
          </div>
        </div>
      </article>
    `;
  });

  tradeGrid.innerHTML = cards.join('');
}

function init() {
  connectionStatus.textContent = 'Connecting...';
  connectionStatus.className = 'status status--waiting';
  addLog(`Using shared market stream: ${STREAM_URL}`);

  unsubscribeTradeUpdates = subscribeToTradeUpdates(({ trades }) => {
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'status status--ok';

    (trades || []).forEach((trade) => {
      tradesById.set(trade.tradeId, trade);
      addLog(
        `${trade.symbol} ${trade.direction} @ ${trade.currentPrice} | P&L: ${trade.unrealizedPnL} | R: ${trade.currentR}`
      );
    });

    renderTrades();
  });
}

clearLogBtn.addEventListener('click', () => {
  eventLog.innerHTML = '';
});

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribeTradeUpdates === 'function') {
    unsubscribeTradeUpdates();
  }
});

renderTrades();
init();