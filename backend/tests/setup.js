const mongoose = require('mongoose');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/primenear_test';

const app = require('../src/app');
const { Admin, PlatformSettings } = require('../src/models');
const { invalidate } = require('../src/services/settings.service');

const SUPER = { email: 'super@test.in', password: 'Super@12345' };

async function connect() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  invalidate();
  await PlatformSettings.getSettings();
  await Admin.create({ ...SUPER, fullName: 'Test Super', role: 'SuperAdmin' });
}

async function disconnect() {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
}

async function login(email = SUPER.email, password = SUPER.password) {
  const res = await request(app).post('/api/admin/auth/login').send({ email, password });
  if (!res.body.data?.token) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

function api(token) {
  const wrap = (method) => (url) => request(app)[method](`/api/admin${url}`).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
}

module.exports = { app, connect, disconnect, login, api, SUPER };
