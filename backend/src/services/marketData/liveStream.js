const clients = new Set();

function addClient(client) {
  clients.add(client);
}

function removeClient(client) {
  clients.delete(client);
}

function broadcast(eventName, payload) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      console.error('[liveStream] broadcast error:', error.message);
    }
  }
}

function getClientCount() {
  return clients.size;
}

module.exports = {
  addClient,
  removeClient,
  broadcast,
  getClientCount,
};