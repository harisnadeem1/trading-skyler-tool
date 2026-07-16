const priceCache = new Map();

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function setPrice(symbol, price, timestamp = new Date().toISOString()) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;

  priceCache.set(normalized, {
    symbol: normalized,
    price: Number(price),
    timestamp,
  });
}

function getPrice(symbol) {
  return priceCache.get(normalizeSymbol(symbol)) || null;
}

function hasFreshPrice(symbol, staleMinutes = 20) {
  const item = getPrice(symbol);
  if (!item) return false;

  const ageMs = Date.now() - new Date(item.timestamp).getTime();
  return ageMs <= staleMinutes * 60 * 1000;
}

function getAllPrices() {
  return Array.from(priceCache.values());
}

module.exports = {
  setPrice,
  getPrice,
  hasFreshPrice,
  getAllPrices,
};