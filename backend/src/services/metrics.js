/**
 * Shared definitions so every screen computes revenue the same way.
 * An order counts toward revenue when money was actually collected
 * (online payment completed or cash bill) and it was not cancelled.
 */
const REVENUE_MATCH = {
  paymentStatus: { $in: ['Completed', 'PartiallyRefunded'] },
  orderStatus: { $nin: ['Cancelled'] },
};

// Net amount of an order after partial refunds
const NET_AMOUNT = { $subtract: ['$finalAmount', { $ifNull: ['$refundedAmount', 0] }] };

const TZ = 'Asia/Kolkata';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

function startOfDay(date = new Date()) {
  // Start of day in IST expressed as a UTC Date
  const ist = new Date(date.getTime() + 330 * 60000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60000);
}

function startOfMonth(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60000);
  ist.setUTCDate(1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/** Resolves ?period=today|week|month|quarter|year|custom&from=&to= into a date range. */
function periodRange({ period = 'month', from, to } = {}) {
  const now = new Date();
  if (period === 'custom' && from) {
    const end = to ? new Date(to) : now;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) end.setUTCHours(18, 29, 59, 999); // end of IST day
    return { start: startOfDay(new Date(from)), end };
  }
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: now };
    case 'week':
      return { start: startOfDay(addDays(now, -6)), end: now };
    case 'quarter':
      return { start: startOfDay(addDays(now, -89)), end: now };
    case 'year':
      return { start: startOfDay(addDays(now, -364)), end: now };
    case 'all':
      return { start: new Date(0), end: now };
    case 'month':
    default:
      return { start: startOfDay(addDays(now, -29)), end: now };
  }
}

module.exports = { REVENUE_MATCH, NET_AMOUNT, TZ, round2, startOfDay, startOfMonth, addDays, periodRange };
