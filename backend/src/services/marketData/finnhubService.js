const WebSocket = require('ws');
const { setPrice, getPrice, hasFreshPrice } = require('./priceCache');
const { emitTradeUpdatesForSymbol } = require('./liveTradeEmitter');
const { processLivePriceUpdate } = require('./tradeMonitorService');
const { getTradesForSymbol } = require('./subscriptionManager');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ENABLE_FINNHUB_WS = process.env.ENABLE_FINNHUB_WS === 'true';
const FINNHUB_WS_URL = `wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`;
const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';

const BASE_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60000;
const STALE_PRICE_SECONDS = 3;
const STALE_CHECK_INTERVAL_MS = 3000;
const MAX_WS_SYMBOLS = Number(process.env.FINNHUB_MAX_WS_SYMBOLS || 50);
const MAX_INVALID_QUOTE_RETRIES = Number(process.env.FINNHUB_MAX_INVALID_QUOTE_RETRIES || 3);

let ws = null;
let connected = false;
const subscribedSymbols = new Set();
const quoteRefreshInFlight = new Set();
const invalidQuoteCounts = new Map();
const blockedSymbols = new Set();
let messageHandler = null;
let reconnectTimeout = null;
let staleCheckInterval = null;
let reconnectAttempts = 0;
let manuallyStopped = false;

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function clearSymbolFailureState(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;
  invalidQuoteCounts.delete(normalized);
  blockedSymbols.delete(normalized);
}

function incrementInvalidQuoteCount(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return 0;

  const nextCount = (invalidQuoteCounts.get(normalized) || 0) + 1;
  invalidQuoteCounts.set(normalized, nextCount);
  return nextCount;
}

function isInvalidFinnhubQuote(quote) {
  if (!quote || typeof quote !== 'object') return true;

  const current = Number(quote.c);
  const high = Number(quote.h);
  const low = Number(quote.l);
  const open = Number(quote.o);
  const previousClose = Number(quote.pc);
  const timestamp = Number(quote.t);

  if (!Number.isFinite(current) || current <= 0) {
    return true;
  }

  if (
    current === 0 &&
    high === 0 &&
    low === 0 &&
    open === 0 &&
    previousClose === 0 &&
    timestamp === 0
  ) {
    return true;
  }

  return false;
}

async function fetchQuote(symbol) {
  const normalized = normalizeSymbol(symbol);
  const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(normalized)}&token=${FINNHUB_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Finnhub quote failed with status ${response.status}`);
  }

  return response.json();
}

function supportsQuoteFallback(symbol) {
  const normalized = normalizeSymbol(symbol);

  if (!normalized) return false;

  if (normalized.endsWith('USD') && !normalized.includes(':')) {
    return false;
  }

  return true;
}

function canTrackMoreSymbols() {
  return subscribedSymbols.size < MAX_WS_SYMBOLS;
}

async function refreshSymbolFromQuote(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;

  if (!supportsQuoteFallback(normalized)) {
    return;
  }

  if (!subscribedSymbols.has(normalized)) {
    return;
  }

  if (blockedSymbols.has(normalized)) {
    return;
  }

  if (quoteRefreshInFlight.has(normalized)) {
    return;
  }

  quoteRefreshInFlight.add(normalized);

  try {
    const quote = await fetchQuote(normalized);

    if (isInvalidFinnhubQuote(quote)) {
      const invalidCount = incrementInvalidQuoteCount(normalized);

      console.warn(
        `[finnhubService] invalid REST quote for ${normalized} (${invalidCount}/${MAX_INVALID_QUOTE_RETRIES}):`,
        quote
      );

      if (invalidCount >= MAX_INVALID_QUOTE_RETRIES) {
        blockedSymbols.add(normalized);
        console.warn(
          `[finnhubService] giving up on ${normalized} after ${invalidCount} invalid quote attempt(s); unsubscribing`
        );
        unsubscribe(normalized);
      }

      return;
    }

    clearSymbolFailureState(normalized);

    const price = Number(quote.c);
    const timestamp = new Date().toISOString();

    const cached = getPrice(normalized);
    const previousPrice = Number(cached?.price);
    const priceChanged = !Number.isFinite(previousPrice) || previousPrice !== price;

    setPrice(normalized, price, timestamp);

    const trades = getTradesForSymbol(normalized);

    if (!priceChanged) {
      return;
    }

    console.log(`[finnhubService] REST quote refresh ${normalized} @ ${price} | matched trades: ${trades.length}`);

    emitTradeUpdatesForSymbol(normalized, price, trades);

    try {
      await processLivePriceUpdate({
        symbol: normalized,
        price,
        timestamp,
        tick: { s: normalized, p: price, t: Date.now(), source: 'rest-quote' },
        trades,
      });
    } catch (error) {
      console.error(`Trade monitor failed for REST quote ${normalized}:`, error);
    }

    if (typeof messageHandler === 'function') {
      try {
        await messageHandler({
          symbol: normalized,
          price,
          timestamp,
          tick: { s: normalized, p: price, t: Date.now(), source: 'rest-quote' },
          trades,
        });
      } catch (error) {
        console.error(`Custom message handler failed for REST quote ${normalized}:`, error);
      }
    }
  } catch (error) {
    console.error(`[finnhubService] REST quote refresh failed for ${normalized}:`, error.message);
  } finally {
    quoteRefreshInFlight.delete(normalized);
  }
}

function startStalePriceMonitor() {
  if (staleCheckInterval) return;

  staleCheckInterval = setInterval(() => {
    for (const symbol of subscribedSymbols) {
      if (!supportsQuoteFallback(symbol)) {
        continue;
      }

      if (blockedSymbols.has(symbol)) {
        continue;
      }

      const cached = getPrice(symbol);

      if (!cached || !hasFreshPrice(symbol, STALE_PRICE_SECONDS)) {
        refreshSymbolFromQuote(symbol);
      }
    }
  }, STALE_CHECK_INTERVAL_MS);
}

function stopStalePriceMonitor() {
  if (!staleCheckInterval) return;
  clearInterval(staleCheckInterval);
  staleCheckInterval = null;
}

function getReconnectDelayMs() {
  const exponentialDelay = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * (2 ** reconnectAttempts)
  );
  const jitter = Math.floor(Math.random() * 1000);
  return exponentialDelay + jitter;
}

function scheduleReconnect() {
  if (!ENABLE_FINNHUB_WS || manuallyStopped) {
    return;
  }

  if (reconnectTimeout) {
    return;
  }

  const delay = getReconnectDelayMs();
  reconnectAttempts += 1;

  console.warn(`[finnhubService] reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect(messageHandler);
  }, delay);
}

function connect(onPrice) {
  messageHandler = onPrice;

  if (!ENABLE_FINNHUB_WS) {
    console.log('[finnhubService] Finnhub WS disabled by environment');
    return null;
  }

  if (!FINNHUB_API_KEY) {
    console.warn('[finnhubService] FINNHUB_API_KEY is missing');
    return null;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws;
  }

  manuallyStopped = false;
  ws = new WebSocket(FINNHUB_WS_URL);

  ws.on('open', () => {
    connected = true;
    reconnectAttempts = 0;

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    console.log('Finnhub websocket connected');

    for (const symbol of subscribedSymbols) {
      if (blockedSymbols.has(symbol)) {
        continue;
      }

      console.log(`[finnhubService] subscribing to ${symbol}`);
      ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }

    startStalePriceMonitor();
  });

  ws.on('message', async (buffer) => {
    try {
      const payload = JSON.parse(buffer.toString());

      if (payload.type === 'ping') {
        return;
      }

      if (!Array.isArray(payload.data)) {
        return;
      }

      for (const tick of payload.data) {
        const symbol = normalizeSymbol(tick.s);
        const price = tick.p;
        const timestamp = tick.t
          ? new Date(tick.t).toISOString()
          : new Date().toISOString();

        if (!symbol || typeof price !== 'number') continue;

        clearSymbolFailureState(symbol);
        setPrice(symbol, price, timestamp);

        const trades = getTradesForSymbol(symbol);

        emitTradeUpdatesForSymbol(symbol, price, trades);

        try {
          await processLivePriceUpdate({
            symbol,
            price,
            timestamp,
            tick,
            trades,
          });
        } catch (error) {
          console.error(`Trade monitor failed for ${symbol}:`, error);
        }

        if (typeof messageHandler === 'function') {
          try {
            await messageHandler({ symbol, price, timestamp, tick, trades });
          } catch (error) {
            console.error(`Custom message handler failed for ${symbol}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Finnhub message parse error:', error);
    }
  });

  ws.on('close', (code, reasonBuffer) => {
    const reason = reasonBuffer ? reasonBuffer.toString() : '';
    console.warn(`Finnhub websocket closed${code ? ` (code: ${code})` : ''}${reason ? ` reason: ${reason}` : ''}`);

    connected = false;
    ws = null;

    if (!manuallyStopped) {
      scheduleReconnect();
    }
  });

  ws.on('error', (error) => {
    console.error('Finnhub websocket error:', error.message || error);
  });

  return ws;
}

function subscribe(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return false;

  if (blockedSymbols.has(normalized)) {
    console.warn(`[finnhubService] refusing to subscribe blocked symbol ${normalized}`);
    return false;
  }

  if (subscribedSymbols.has(normalized)) {
    return true;
  }

  if (!canTrackMoreSymbols()) {
    console.warn(
      `[finnhubService] symbol limit reached (${MAX_WS_SYMBOLS}). Cannot subscribe to ${normalized}`
    );
    return false;
  }

  clearSymbolFailureState(normalized);
  subscribedSymbols.add(normalized);

  if (ws && connected && ws.readyState === WebSocket.OPEN) {
    console.log(`[finnhubService] subscribing to ${normalized}`);
    ws.send(JSON.stringify({ type: 'subscribe', symbol: normalized }));
  }

  return true;
}

function unsubscribe(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return false;

  const removed = subscribedSymbols.delete(normalized);
  quoteRefreshInFlight.delete(normalized);
  invalidQuoteCounts.delete(normalized);
  blockedSymbols.delete(normalized);

  if (removed && ws && connected && ws.readyState === WebSocket.OPEN) {
    console.log(`[finnhubService] unsubscribing from ${normalized}`);
    ws.send(JSON.stringify({ type: 'unsubscribe', symbol: normalized }));
  }

  return removed;
}

function disconnect() {
  manuallyStopped = true;
  connected = false;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  stopStalePriceMonitor();

  if (ws) {
    try {
      ws.close();
    } catch (error) {
      console.error('[finnhubService] error during disconnect:', error.message);
    }
    ws = null;
  }

  quoteRefreshInFlight.clear();
  invalidQuoteCounts.clear();
  blockedSymbols.clear();

  console.log('[finnhubService] Finnhub websocket manually stopped');
}

function getSubscribedSymbols() {
  return Array.from(subscribedSymbols);
}

function getSubscribedSymbolCount() {
  return subscribedSymbols.size;
}

function isConnected() {
  return connected;
}

module.exports = {
  fetchQuote,
  connect,
  disconnect,
  subscribe,
  unsubscribe,
  getSubscribedSymbols,
  getSubscribedSymbolCount,
  isConnected,
  refreshSymbolFromQuote,
  supportsQuoteFallback,
};