/**
 * Reads ?page & ?limit from the query and returns skip/limit values.
 */
function getPagination(query, defaultLimit = 20) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 200);
  return { page, limit, skip: (page - 1) * limit };
}

function paginated(items, totalCount, { page, limit }, extra = {}) {
  return {
    items,
    totalCount,
    page,
    limit,
    pages: Math.ceil(totalCount / limit) || 1,
    ...extra,
  };
}

/** Escapes a user supplied string for safe use inside a RegExp. */
function escapeRegex(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchRegex(text) {
  return new RegExp(escapeRegex(text.trim()), 'i');
}

/** Parses ?from=&to= query values into a createdAt range filter. */
function dateRange(query, field = 'createdAt') {
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) {
    const to = new Date(query.to);
    // Treat a plain date as inclusive of the whole day
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return Object.keys(range).length ? { [field]: range } : {};
}

module.exports = { getPagination, paginated, escapeRegex, searchRegex, dateRange };
