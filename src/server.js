const { env, assertProductionEnv } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const app = require('./app');
const { startJobs } = require('./jobs');

async function startServer() {
  try {
    assertProductionEnv();
    await connectDatabase();
    const server = app.listen(env.port, () => {
      console.info(`AVOM API listening on port ${env.port} (${env.nodeEnv}).`);
    });
    startJobs();

    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.info(`${signal} received; shutting down.`);
      server.close(async (error) => {
        try {
          await disconnectDatabase();
        } finally {
          process.exit(error ? 1 : 0);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Unable to start AVOM API:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) startServer();

module.exports = { startServer };
