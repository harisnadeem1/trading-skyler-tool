const bridgeService = require('../services/bridge/bridgeService');

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

async function registerBridge(req, res) {
  try {
    const data = await bridgeService.registerBridge(req.user.id, req.body.label);
    res.json({
      message: 'Bridge token generated. Copy it now.',
      ...data,
    });
  } catch (error) {
    console.error('registerBridge error:', error);
    res.status(500).json({ message: 'Failed to register bridge' });
  }
}

async function bridgeStatus(req, res) {
  try {
    const data = await bridgeService.getBridgeStatus(req.user.id);
    res.json(data);
  } catch (error) {
    console.error('bridgeStatus error:', error);
    res.status(500).json({ message: 'Failed to load bridge status' });
  }
}

async function heartbeat(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Missing bridge token' });

    const client = await bridgeService.getBridgeClientFromToken(token);
    if (!client) return res.status(401).json({ message: 'Invalid bridge token' });

    await bridgeService.touchHeartbeat(client.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('heartbeat error:', error);
    res.status(500).json({ message: 'Heartbeat failed' });
  }
}

async function executions(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Missing bridge token' });

    const client = await bridgeService.getBridgeClientFromToken(token);
    if (!client) return res.status(401).json({ message: 'Invalid bridge token' });

    await bridgeService.touchHeartbeat(client.id);

    const executions = Array.isArray(req.body.executions) ? req.body.executions : [];
    console.log('[BridgeController] /executions received:', executions);

    const result = await bridgeService.ingestExecutions(client.userid, executions);
    console.log('[BridgeController] /executions result:', result);

    res.json(result);
  } catch (error) {
    console.error('executions error:', error);
    res.status(500).json({ message: 'Execution ingest failed' });
  }
}

async function positions(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Missing bridge token' });

    const client = await bridgeService.getBridgeClientFromToken(token);
    if (!client) return res.status(401).json({ message: 'Invalid bridge token' });

    await bridgeService.touchHeartbeat(client.id);

    const positions = Array.isArray(req.body.positions) ? req.body.positions : [];
    const result = await bridgeService.ingestPositions(client.userid, positions);

    res.json(result);
  } catch (error) {
    console.error('positions error:', error);
    res.status(500).json({ message: 'Position ingest failed' });
  }
}

async function openOrders(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Missing bridge token' });

    const client = await bridgeService.getBridgeClientFromToken(token);
    if (!client) return res.status(401).json({ message: 'Invalid bridge token' });

    await bridgeService.touchHeartbeat(client.id);

    const orders = Array.isArray(req.body.orders) ? req.body.orders : [];
    const result = await bridgeService.ingestOpenOrders(client.userid, orders);

    res.json(result);
  } catch (error) {
    console.error('openOrders error:', error);
    res.status(500).json({ message: 'Open orders ingest failed' });
  }
}

module.exports = {
  registerBridge,
  bridgeStatus,
  heartbeat,
  executions,
  positions,
  openOrders,
};