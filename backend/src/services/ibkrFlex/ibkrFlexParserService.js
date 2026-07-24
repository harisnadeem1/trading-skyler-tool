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
  const s = String(value).trim();

  if (s.includes('T')) return s;
  if (s.includes('-')) return s;

  const digits = s.replace(/[^\d]/g, '');
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }

  return s;
}

function normalizeDateTime(dateValue, timeValue) {
  if (!dateValue && !timeValue) return null;

  const rawDate = dateValue ? String(dateValue).trim() : '';
  const rawTime = timeValue ? String(timeValue).trim() : '';

  const combinedMatch = rawDate.match(/^(\d{8})[; ](\d{6})$/);
  if (combinedMatch) {
    const d = combinedMatch[1];
    const t = combinedMatch[2];
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  }

  const d = normalizeDate(rawDate);
  if (!d) return null;

  if (!rawTime) return `${d}T00:00:00Z`;

  const t = rawTime.replace(/[^\d]/g, '').padStart(6, '0').slice(0, 6);
  return `${d}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
}

function parseExecutions(xml) {
  const parsed = parser.parse(xml);
  const root = parsed.FlexQueryResponse || {};
  const statements = toArray(root.FlexStatements?.FlexStatement || root.FlexStatement);
  const trades = [];

  for (const statement of statements) {
    const statementAccountId =
      statement.accountId ||
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
        row.brokerageOrderID ||
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
        row.dateTime || row.tradeDate || row.date,
        row.tradeTime || row.time || row.orderTime
      );

      const commissionRaw = toNumber(
        row.ibCommission ||
        row.commission ||
        row.brokerExecutionCommission
      );

      const commission = commissionRaw === null ? null : Math.abs(commissionRaw);

      const currency = row.currency || row.commissionCurrency || 'USD';

      const accountId =
        row.accountId ||
        row.accountID ||
        statementAccountId ||
        null;

      const conId = row.conid || row.conId || null;
      const assetCategory = row.assetCategory || row.assetClass || row.secType || null;
      const tradeDate = normalizeDate(row.tradeDate || row.reportDate || row.date || null);

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
        accountId: accountId ? String(accountId) : null,
        conId: conId ? String(conId) : null,
        assetCategory: assetCategory ? String(assetCategory) : null,
        tradeDate,
        rawPayload: row
      });
    }
  }

  return trades;
}

function parseAccountSnapshots(xml) {
  const parsed = parser.parse(xml);
  const root = parsed.FlexQueryResponse || {};
  const statements = toArray(root.FlexStatements?.FlexStatement || root.FlexStatement);
  const snapshots = [];

  for (const statement of statements) {
    const info = statement.AccountInformation || {};

    const statementAccountId =
      statement.accountId ||
      info.accountId ||
      info.accountIdAlias ||
      null;

    const statementCurrency =
      info.currency ||
      statement.currency ||
      null;

    const rows = [
      ...toArray(statement.EquitySummaryInBase?.EquitySummaryByReportDateInBase),
      ...toArray(statement.NetAssetValueInBase?.NetAssetValueByReportDateInBase),
      ...toArray(statement.NetAssetValueSummaryInBase?.NetAssetValueByReportDateInBase)
    ];

    for (const row of rows) {
      const reportDate = normalizeDate(row.reportDate || row.date || null);
      const total = toNumber(row.total || row.navTotal || row.netAssetValue);

      if (!reportDate || total === null) continue;

      const accountId =
        row.accountId ||
        row.accountID ||
        statementAccountId ||
        null;

      const currency =
        row.currency ||
        statementCurrency ||
        null;

      snapshots.push({
        accountId: accountId ? String(accountId) : null,
        currency: currency ? String(currency) : null,
        reportDate,
        total,
        cash: toNumber(row.cash),
        stock: toNumber(row.stock),
        options: toNumber(row.options),
        bonds: toNumber(row.bonds),
        commodities: toNumber(row.commodities),
        funds: toNumber(row.funds),
        dividendAccruals: toNumber(row.dividendAccruals),
        interestAccruals: toNumber(row.interestAccruals),
        forexCfdUnrealizedPl: toNumber(row.forexCfdUnrealizedPl),
        cfdUnrealizedPl: toNumber(row.cfdUnrealizedPl),
        crypto: toNumber(row.crypto),
        rawPayload: row
      });
    }
  }

  return snapshots;
}

function parseFlexReport(xml) {
  return {
    trades: parseExecutions(xml),
    accountSnapshots: parseAccountSnapshots(xml)
  };
}

module.exports = {
  parseExecutions,
  parseAccountSnapshots,
  parseFlexReport
};