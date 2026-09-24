const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server / curl requests (no origin) and configured frontends
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Uploaded images (logos, shop images, category icons, ...)
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false }));

app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok', time: new Date() }));

// One backend for all three apps. The user app (/api/user) will be mounted here next.
app.use('/api/admin', require('./routes/admin'));
app.use('/api/seller', require('./routes/seller'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
