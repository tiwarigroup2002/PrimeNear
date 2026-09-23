function ok(res, data = null, message) {
  return res.json({ success: true, ...(message ? { message } : {}), data });
}

function created(res, data = null, message = 'Created successfully') {
  return res.status(201).json({ success: true, message, data });
}

module.exports = { ok, created };
