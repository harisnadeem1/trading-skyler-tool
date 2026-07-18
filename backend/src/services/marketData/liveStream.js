const clients = new Map();

function formatMessage(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') {
    return null;
  }
  return String(userId);
}

function addClient(client, meta = {}) {
  const userId = normalizeUserId(meta.userId);

  clients.set(client, {
    userId,
    connectedAt: new Date().toISOString(),
  });
}

function removeClient(client) {
  clients.delete(client);
}

function sendToClient(client, eventName, payload) {
  const message = formatMessage(eventName, payload);

  try {
    client.write(message);
    return true;
  } catch (error) {
    console.error('[liveStream] send error:', error.message);
    clients.delete(client);
    return false;
  }
}

function broadcast(eventName, payload) {
  for (const client of clients.keys()) {
    sendToClient(client, eventName, payload);
  }
}

function broadcastToUser(userId, eventName, payload) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  for (const [client, meta] of clients.entries()) {
    if (meta.userId === normalizedUserId) {
      sendToClient(client, eventName, payload);
    }
  }
}

function broadcastToUsers(items = []) {
  for (const item of items) {
    if (!item) continue;

    const { userId, eventName, payload } = item;
    broadcastToUser(userId, eventName, payload);
  }
}

function getClientCount() {
  return clients.size;
}

function getUserClientCount(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return 0;

  let count = 0;

  for (const meta of clients.values()) {
    if (meta.userId === normalizedUserId) {
      count += 1;
    }
  }

  return count;
}

function getConnectedUserIds() {
  const ids = new Set();

  for (const meta of clients.values()) {
    if (meta.userId) {
      ids.add(meta.userId);
    }
  }

  return Array.from(ids);
}

module.exports = {
  addClient,
  removeClient,
  sendToClient,
  broadcast,
  broadcastToUser,
  broadcastToUsers,
  getClientCount,
  getUserClientCount,
  getConnectedUserIds,
};