const WebSocket = require('ws');
const { setPrice, getPrice, hasFreshPrice } = require('./priceCache');
const { emitTradeUpdatesForSymbol } = require('./liveTradeEmitter');
const { processLivePriceUpdate } = require('./tradeMonitorService');
const { getTradesForSymbol } = require('./subscriptionManager');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_WS_URL = `wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`;
const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';

let ws = null;
let connected = false;
const subscribedSymbols = new Set();
let messageHandler = null;
let reconnectTimeout = null;
let staleCheckInterval = null;

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

function connect(onPrice) {
  if (ws) return ws;

  messageHandler = onPrice;
  ws = new WebSocket(FINNHUB_WS_URL);

  ws.on('open', () => {
    connected = true;
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

  ws.on('close', () => {
    console.warn('Finnhub websocket closed');
    connected = false;
    ws = null;

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    reconnectTimeout = setTimeout(() => {
      connect(messageHandler);
    }, 3000);
  });

  ws.on('error', (error) => {
    console.error('Finnhub websocket error:', error);
  });

  return ws;
}

function subscribe(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return;

  subscribedSymbols.add(normalized);

  if (ws && connected) {
    console.log(`[finnhubService] subscribing to ${normalized}`);
    ws.send(JSON.stringify({ type: 'subscribe', symbol: normalized }));
  }
}

function unsubscribe(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return;

  subscribedSymbols.delete(normalized);

  if (ws && connected) {
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
  subscribe,
  unsubscribe,
  getSubscribedSymbols,
  refreshSymbolFromQuote,
};