const mongoose = require('mongoose');
const config = require('./index');
const logger = require('./logger');

async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  // District names are unique per state now (old databases had a unique index on name only)
  try {
    await require('../models').District.syncIndexes();
  } catch (err) {
    logger.warn(`District index update skipped: ${err.message}`);
  }
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
