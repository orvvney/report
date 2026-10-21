module.exports = async () => {
  const server = global.__E2E_SERVER__;
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
    delete global.__E2E_SERVER__;
  }
};
