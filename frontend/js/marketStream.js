// js/services/marketStream.js

const listenersBySymbol = new Map();
const latestPriceBySymbol = new Map();
const tradeAlertListeners = new Set();
const tradeUpdateListeners = new Set();
const connectionListeners = new Set();

let eventSource = null;
let streamStarted = false;

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function notifyConnection(type, payload = {}) {
  connectionListeners.forEach((cb) => {
    try {
      cb({ type, ...payload });
    } catch (error) {
      console.error('[marketStream] connection listener error', error);
    }
  });
}

function notifyTradeAlert(payload) {
  tradeAlertListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (error) {
      console.error('[marketStream] trade-alert listener error', error);
    }
  });
}

function notifyTradeUpdates(payload) {
  tradeUpdateListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (error) {
      console.error('[marketStream] trade-update listener error', error);
    }
  });
}

function parseEventData(event) {
  try {
    return JSON.parse(event.data);
  } catch (error) {
    console.error('[marketStream] failed to parse event data', error);
    return null;
  }
}

function ensureStream() {
  if (eventSource) return eventSource;

  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const baseUrl = isLocal ? 'http://localhost:3000' : window.location.origin;
  const streamUrl = `${baseUrl}/api/market/stream`;

  eventSource = new EventSource(streamUrl, { withCredentials: true });

  eventSource.addEventListener('connected', (event) => {
    const payload = parseEventData(event);
    streamStarted = true;
    notifyConnection('connected', payload || {});
  });

  eventSource.addEventListener('ping', (event) => {
    const payload = parseEventData(event);
    notifyConnection('ping', payload || {});
  });

  eventSource.addEventListener('trade-update', (event) => {
    const payload = parseEventData(event);
    if (!payload) return;

    const trades = Array.isArray(payload.trades) ? payload.trades : [];
    const receivedAt = Date.now();
    const updatedAt = payload.updatedAt || new Date().toISOString();

    trades.forEach((trade) => {
      const symbol = normalizeSymbol(trade.symbol || trade.ticker);
      const price = Number(
        trade.currentPrice ??
        trade.current_price ??
        trade.livePrice ??
        trade.price
      );

      if (!symbol) return;
      if (!(price > 0)) return;

      const update = {
        symbol,
        price,
        raw: trade,
        updatedAt: trade.updatedAt || trade.updated_at || updatedAt,
        receivedAt,
      };

      latestPriceBySymbol.set(symbol, update);

      const listeners = listenersBySymbol.get(symbol);
      if (!listeners || listeners.size === 0) return;

      listeners.forEach((cb) => {
        try {
          cb(update);
        } catch (error) {
          console.error('[marketStream] price listener error', error);
        }
      });
    });

    notifyTradeUpdates({
      trades,
      raw: payload,
      updatedAt,
      receivedAt,
    });
  });

  eventSource.addEventListener('trade-alert', (event) => {
    const payload = parseEventData(event);
    if (!payload) return;

    notifyTradeAlert({
      ...payload,
      receivedAt: Date.now(),
    });
  });

  eventSource.onerror = (error) => {
    notifyConnection('error', { error });
    console.error('[marketStream] stream error', error);
  };

  return eventSource;
}

export function subscribeToPrice(symbol, cb) {
  const key = normalizeSymbol(symbol);
  if (!key || typeof cb !== 'function') return () => {};

  ensureStream();

  if (!listenersBySymbol.has(key)) {
    listenersBySymbol.set(key, new Set());
  }

  const set = listenersBySymbol.get(key);
  set.add(cb);

  const latest = latestPriceBySymbol.get(key);
  if (latest) {
    try {
      cb(latest);
    } catch (error) {
      console.error('[marketStream] replay listener error', error);
    }
  }

  return () => {
    const current = listenersBySymbol.get(key);
    if (!current) return;

    current.delete(cb);

    if (current.size === 0) {
      listenersBySymbol.delete(key);
    }
  };
}

export function getLatestPrice(symbol) {
  const key = normalizeSymbol(symbol);
  if (!key) return null;
  return latestPriceBySymbol.get(key) || null;
}

export function subscribeToTradeUpdates(cb) {
  if (typeof cb !== 'function') return () => {};

  ensureStream();
  tradeUpdateListeners.add(cb);

  return () => {
    tradeUpdateListeners.delete(cb);
  };
}

export function subscribeToTradeAlerts(cb) {
  if (typeof cb !== 'function') return () => {};

  ensureStream();
  tradeAlertListeners.add(cb);

  return () => {
    tradeAlertListeners.delete(cb);
  };
}

export function subscribeToMarketConnection(cb) {
  if (typeof cb !== 'function') return () => {};

  ensureStream();
  connectionListeners.add(cb);

  return () => {
    connectionListeners.delete(cb);
  };
}

export function closeMarketStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  streamStarted = false;
}

export function isMarketStreamActive() {
  return !!eventSource && streamStarted;
}