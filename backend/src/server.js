const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { connectDB } = require('./config/db');
const { startScheduler } = require('./jobs/scheduler');
const { seedTestAccount } = require('./seed/seedTestAccount');

async function start() {
  await connectDB();
  await seedTestAccount();
  startScheduler();
  const server = app.listen(config.port, () => logger.info(`PrimeNear API listening on port ${config.port} (${config.env})`));

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});
