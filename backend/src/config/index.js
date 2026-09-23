require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';

const required = (name, fallback) => {
  const value = process.env[name] || fallback;
  if (!value && env === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

module.exports = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT) || 3000,
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/primenear'),
  jwt: {
    secret: required('JWT_SECRET', 'dev_only_jwt_secret'),
    expire: process.env.JWT_EXPIRE || '1d',
  },
  encryptionKey: required('DATA_ENCRYPTION_KEY', 'dev_only_encryption_key'),
  adminPanelUrl: process.env.ADMIN_PANEL_URL || 'http://localhost:4200',
  superAdmin: {
    email: process.env.SUPERADMIN_EMAIL || 'admin@primenear.in',
    password: process.env.SUPERADMIN_PASSWORD || 'Admin@12345',
    name: process.env.SUPERADMIN_NAME || 'Super Admin',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'PrimeNear <no-reply@primenear.in>',
  },
  uploadDir: require('path').join(__dirname, '..', '..', 'uploads'),
  // Generated reports are private and only served through an authenticated endpoint
  reportDir: require('path').join(__dirname, '..', '..', 'storage', 'reports'),
};
