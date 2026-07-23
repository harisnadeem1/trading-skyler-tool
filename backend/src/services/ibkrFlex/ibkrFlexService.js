const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: true,
  trimValues: true
});

const BASE_URL =
  process.env.IBKR_FLEX_BASE_URL ||
  'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseXml(xml) {
  return parser.parse(xml);
}

function getString(value) {
  return value == null ? '' : String(value);
}

async function requestFlexReport({ token, queryId }) {
  const url = `${BASE_URL}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const response = await axios.get(url, {
    timeout: Number(process.env.IBKR_FLEX_FETCH_TIMEOUT_MS || 30000)
  });

  const data = parseXml(response.data);
  const root = data.FlexStatementResponse || data;

  if (getString(root.Status).toLowerCase() !== 'success') {
    throw new Error(root.ErrorMessage || 'IBKR Flex request failed');
  }

  return {
    referenceCode: root.ReferenceCode,
    responseUrl: root.Url
  };
}

async function fetchFlexReport({ token, referenceCode }) {
  const url = `${BASE_URL}/GetStatement?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`;

  for (let i = 0; i < 10; i += 1) {
    const response = await axios.get(url, {
      timeout: Number(process.env.IBKR_FLEX_FETCH_TIMEOUT_MS || 30000)
    });

    const raw = response.data;
    const parsed = parseXml(raw);
    const root = parsed.FlexStatementResponse || parsed;

    if (root.Status) {
      const status = getString(root.Status).toLowerCase();

      if (status === 'fail') {
        const message = getString(root.ErrorMessage || 'IBKR Flex fetch failed');
        if (message.toLowerCase().includes('statement generation in progress')) {
          await sleep(2000);
          continue;
        }
        throw new Error(message);
      }

      if (status === 'success' && !parsed.FlexQueryResponse) {
        await sleep(2000);
        continue;
      }
    }

    return raw;
  }

  throw new Error('IBKR Flex report not ready in time');
}

async function downloadReport({ token, queryId }) {
  const request = await requestFlexReport({ token, queryId });
  const xml = await fetchFlexReport({
    token,
    referenceCode: request.referenceCode
  });

  return {
    xml,
    referenceCode: request.referenceCode,
    responseUrl: request.responseUrl
  };
}

module.exports = {
  downloadReport
};