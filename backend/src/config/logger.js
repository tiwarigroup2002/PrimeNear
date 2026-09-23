const winston = require('winston');
const config = require('./index');

const logger = winston.createLogger({
  level: config.isProd ? 'info' : 'debug',
  silent: config.isTest,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.isProd
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, stack }) =>
          `${timestamp} ${level}: ${stack || message}`)
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
