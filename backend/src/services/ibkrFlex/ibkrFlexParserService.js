const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: true,
  trimValues: true
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function normalizeDate(value) {
  if (!value) return null;
  const s = String(value);
  if (s.includes('-') || s.includes('T')) return s;
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

function normalizeDateTime(dateValue, timeValue) {
  const d = normalizeDate(dateValue);
  if (!d) return null;
  if (!timeValue) return `${d}T00:00:00Z`;

  const t = String(timeValue).replace(/[^\d]/g, '').padStart(6, '0').slice(0, 6);
  return `${d}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
}

function parseExecutions(xml) {
  const parsed = parser.parse(xml);
  const root = parsed.FlexQueryResponse || {};
  const statements = toArray(root.FlexStatements?.FlexStatement || root.FlexStatement);
  const trades = [];

  for (const statement of statements) {
    const accountId =
      statement.AccountInformation?.accountId ||
      statement.AccountInformation?.accountIdAlias ||
      null;

    const sections = [
      ...toArray(statement.Trades?.Trade),
      ...toArray(statement.TradeConfirms?.TradeConfirm),
      ...toArray(statement.TradeConfirmations?.TradeConfirm)
    ];

    for (const row of sections) {
      const executionId =
        row.tradeID ||
        row.transactionID ||
        row.execID ||
        row.executionID ||
        row.ibExecID ||
        null;

      const orderId =
        row.orderID ||
        row.ibOrderID ||
        row.brokerOrderID ||
        null;

      const symbol =
        row.symbol ||
        row.underlyingSymbol ||
        row.localSymbol ||
        row.description ||
        null;

      const rawQty = toNumber(row.quantity || row.tradeQuantity || row.qty);

      const sideRaw = String(
        row.buySell ||
        row.side ||
        row.transactionType ||
        ''
      ).toUpperCase();

      let side = null;
      if (sideRaw.includes('BUY')) side = 'BUY';
      if (sideRaw.includes('SELL')) side = 'SELL';
      if (!side && rawQty !== null) {
        side = rawQty < 0 ? 'SELL' : 'BUY';
      }

      const quantity = rawQty === null ? null : Math.abs(rawQty);
      const price = toNumber(row.tradePrice || row.price);
      const executedAt = normalizeDateTime(
        row.tradeDate || row.dateTime || row.date,
        row.tradeTime || row.time
      );
      const commission = toNumber(row.ibCommission || row.commission);
      const currency = row.currency || 'USD';
      const conId = row.conid || row.conId || null;
      const assetCategory = row.assetCategory || row.assetClass || row.secType || null;
      const tradeDate = normalizeDate(row.tradeDate || row.date || null);

      if (!executionId || !symbol || !side || !quantity || quantity <= 0 || !price || !executedAt) {
        continue;
      }

      trades.push({
        ibkrExecutionId: String(executionId),
        ibkrOrderId: orderId ? String(orderId) : null,
        symbol: String(symbol),
        side,
        quantity,
        price,
        executedAt,
        commission,
        currency,
        accountId,
        conId: conId ? String(conId) : null,
        assetCategory: assetCategory ? String(assetCategory) : null,
        tradeDate,
        rawPayload: row
      });
    }
  }

  return trades;
}

module.exports = {
  parseExecutions
};