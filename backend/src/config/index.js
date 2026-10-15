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
  sms: {
    provider: process.env.SMS_PROVIDER || '', // e.g. msg91 / twilio (not wired yet)
  },
  otp: {
    // Fixed OTP for local testing only (ignored in production)
    fixedCode: env !== 'production' ? process.env.DEV_FIXED_OTP || '' : '',
  },
  // India state / district / taluka / PIN directory (free data, downloaded once and cached in storage/)
  indiaLocations: {
    sourceUrl: process.env.INDIA_LOCATIONS_URL || 'https://raw.githubusercontent.com/saravanakumargn/All-India-Pincode-Directory/master/all-india-pincode-html-csv.csv',
    // Optional local CSV with the same columns (used by tests / offline installs)
    sourceFile: process.env.INDIA_LOCATIONS_FILE || '',
    cacheFile: require('path').join(__dirname, '..', '..', 'storage', 'india-locations.json'),
    // Free India Post API for PIN codes missing from the directory
    pincodeApi: process.env.PINCODE_API_URL || 'https://api.postalpincode.in/pincode/',
  },
  uploadDir: require('path').join(__dirname, '..', '..', 'uploads'),
  // Generated reports are private and only served through an authenticated endpoint
  reportDir: require('path').join(__dirname, '..', '..', 'storage', 'reports'),
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'ap-southeast-2',
    bucket: process.env.S3_BUCKET_NAME || 'primencar',
  },
};
