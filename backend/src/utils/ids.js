const Counter = require('../models/Counter');

/**
 * Generates human friendly sequential IDs like ORD-20240923-00001.
 * The sequence restarts every day per prefix.
 */
async function generateId(prefix, date = new Date()) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  const key = `${prefix}-${day}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return `${key}-${String(counter.seq).padStart(5, '0')}`;
}

module.exports = { generateId };
