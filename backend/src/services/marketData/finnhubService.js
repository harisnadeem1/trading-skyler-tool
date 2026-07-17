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

let ws = null;
let connected = false;
const subscribedSymbols = new Set();
let messageHandler = null;
let reconnectTimeout = null;
let staleCheckInterval = null;
let reconnectAttempts = 0;
let manuallyStopped = false;

async function fetchQuote(symbol) {
  const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Finnhub quote failed with status ${response.status}`);
  }

  return response.json();
}

async function refreshSymbolFromQuote(symbol) {
  try {
    const quote = await fetchQuote(symbol);
    const price = Number(quote.c);
    const timestamp = new Date().toISOString();

    if (!Number.isFinite(price) || price <= 0) {
      console.warn(`[finnhubService] invalid REST quote for ${symbol}:`, quote);
      return;
    }

    setPrice(symbol, price, timestamp);

    const trades = getTradesForSymbol(symbol);

    console.log(`[finnhubService] REST quote refresh ${symbol} @ ${price} | matched trades: ${trades.length}`);

    emitTradeUpdatesForSymbol(symbol, price, trades);

    try {
      await processLivePriceUpdate({
        symbol,
        price,
        timestamp,
        tick: { s: symbol, p: price, t: Date.now(), source: 'rest-quote' },
        trades,
      });
    } catch (error) {
      console.error(`Trade monitor failed for REST quote ${symbol}:`, error);
    }

    if (typeof messageHandler === 'function') {
      try {
        await messageHandler({
          symbol,
          price,
          timestamp,
          tick: { s: symbol, p: price, t: Date.now(), source: 'rest-quote' },
          trades,
        });
      } catch (error) {
        console.error(`Custom message handler failed for REST quote ${symbol}:`, error);
      }
    }
  } catch (error) {
    console.error(`[finnhubService] REST quote refresh failed for ${symbol}:`, error.message);
  }
}

function startStalePriceMonitor() {
  if (staleCheckInterval) return;

  staleCheckInterval = setInterval(async () => {
    for (const symbol of subscribedSymbols) {
      const cached = getPrice(symbol);

      if (!cached || !hasFreshPrice(symbol, 1)) {
        console.warn(`[finnhubService] stale/missing price for ${symbol}, refreshing via REST quote`);
        await refreshSymbolFromQuote(symbol);
      }
    }
  }, 15000);
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
        const symbol = tick.s;
        const price = tick.p;
        const timestamp = tick.t
          ? new Date(tick.t).toISOString()
          : new Date().toISOString();

        if (!symbol || typeof price !== 'number') continue;

        console.log(`[finnhubService] WS tick ${symbol} @ ${price}`);

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

  console.log('[finnhubService] Finnhub websocket manually stopped');
}

function subscribe(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return;

  subscribedSymbols.add(normalized);

  if (ws && connected && ws.readyState === WebSocket.OPEN) {
    console.log(`[finnhubService] subscribing to ${normalized}`);
    ws.send(JSON.stringify({ type: 'subscribe', symbol: normalized }));
  }
}

function unsubscribe(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return;

  subscribedSymbols.delete(normalized);

  if (ws && connected && ws.readyState === WebSocket.OPEN) {
    console.log(`[finnhubService] unsubscribing from ${normalized}`);
    ws.send(JSON.stringify({ type: 'unsubscribe', symbol: normalized }));
  }
}

function getSubscribedSymbols() {
  return Array.from(subscribedSymbols);
}

module.exports = {
  fetchQuote,
  connect,
  disconnect,
  subscribe,
  unsubscribe,
  getSubscribedSymbols,
  refreshSymbolFromQuote,
};