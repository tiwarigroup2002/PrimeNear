const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('./expect');
const { authenticator } = require('otplib');

const generate = async ({ secret }) => authenticator.generate(secret);
const { connect, disconnect, login, api, app, SUPER } = require('./setup');
const request = require('supertest');
const { Admin, PlatformSettings } = require('../src/models');
const { invalidate } = require('../src/services/settings.service');

beforeAll(connect);
afterAll(disconnect);

describe('Admin auth', () => {
  test('rejects wrong password and accepts correct one', async () => {
    const bad = await request(app).post('/api/admin/auth/login').send({ email: SUPER.email, password: 'nope' });
    expect(bad.status).toBe(401);
    const token = await login();
    const me = await api(token).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('SuperAdmin');
    expect(me.body.data.permissions).toContain('admins.manage');
  });

  test('requires a token for protected routes', async () => {
    const res = await request(app).get('/api/admin/sellers');
    expect(res.status).toBe(401);
  });

  test('locks the account after too many failed attempts', async () => {
    await Admin.create({ email: 'lock@test.in', password: 'Lock@12345', fullName: 'Lock', role: 'Admin' });
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/admin/auth/login').send({ email: 'lock@test.in', password: 'wrong' });
    }
    const res = await request(app).post('/api/admin/auth/login').send({ email: 'lock@test.in', password: 'Lock@12345' });
    expect(res.status).toBe(423);
  });

  test('logout invalidates the token', async () => {
    const token = await login();
    await api(token).post('/auth/logout').expect(200);
    await api(token).get('/auth/me').expect(401);
  });

  test('2FA setup, enable and login with code', async () => {
    const token = await login();
    const setup = await api(token).post('/auth/2fa/setup').expect(200);
    const { secret } = setup.body.data;
    expect(setup.body.data.qrCode).toMatch(/^data:image\/png/);
    await api(token).post('/auth/2fa/enable').send({ code: '000000' }).expect(400);
    await api(token).post('/auth/2fa/enable').send({ code: await generate({ secret }) }).expect(200);

    const first = await request(app).post('/api/admin/auth/login').send(SUPER).expect(200);
    expect(first.body.data.requires2fa).toBe(true);
    const temp = first.body.data.tempToken;
    // Temp token cannot be used for normal APIs
    await api(temp).get('/auth/me').expect(401);
    const done = await request(app).post('/api/admin/auth/verify-2fa').set('Authorization', `Bearer ${temp}`).send({ code: await generate({ secret }) }).expect(200);
    const full = done.body.data.token;
    await api(full).post('/auth/2fa/disable').send({ password: SUPER.password }).expect(200);
  });

  test('forgot / reset password flow', async () => {
    const crypto = require('../src/utils/crypto');
    await request(app).post('/api/admin/auth/forgot-password').send({ email: SUPER.email }).expect(200);
    // Simulate clicking the email link by setting a known token
    const token = 'known-reset-token';
    await Admin.updateOne({ email: SUPER.email }, { passwordResetToken: crypto.sha256(token), passwordResetExpires: new Date(Date.now() + 60000) });
    await request(app).post('/api/admin/auth/reset-password').send({ token, newPassword: 'weak' }).expect(400);
    await request(app).post('/api/admin/auth/reset-password').send({ token, newPassword: 'Changed@123' }).expect(200);
    await login(SUPER.email, 'Changed@123');
    await request(app).post('/api/admin/auth/reset-password').send({ token, newPassword: 'Changed@456' }).expect(400);
    const t = await login(SUPER.email, 'Changed@123');
    await api(t).put('/auth/change-password').send({ currentPassword: 'Changed@123', newPassword: SUPER.password }).expect(200);
  });

  test('mandatory 2FA flag is returned when platform requires it', async () => {
    await PlatformSettings.updateOne({}, { 'securitySettings.enableTwoFactor': true });
    invalidate();
    const res = await request(app).post('/api/admin/auth/login').send(SUPER).expect(200);
    expect(res.body.data.mustSetup2fa).toBe(true);
    await PlatformSettings.updateOne({}, { 'securitySettings.enableTwoFactor': false });
    invalidate();
  });
});

describe('Role based access', () => {
  test('support admin cannot manage sellers or admins', async () => {
    const token = await login();
    await api(token).post('/admins').send({ email: 'support@test.in', password: 'Support@123', fullName: 'Support', role: 'SupportAdmin' }).expect(201);
    const support = await login('support@test.in', 'Support@123');
    await api(support).get('/sellers').expect(200);
    await api(support).post('/sellers').send({}).expect(403);
    await api(support).get('/admins').expect(403);
    await api(support).get('/settings').expect(403);
    await api(support).get('/disputes').expect(200);
  });

  test('extra permissions can be granted to a role', async () => {
    const token = await login();
    const created = await api(token).post('/admins').send({ email: 'ops@test.in', password: 'Ops@12345', fullName: 'Ops', role: 'SupportAdmin' }).expect(201);
    const ops = await login('ops@test.in', 'Ops@12345');
    await api(ops).get('/analytics/revenue').expect(403);
    await api(token).put(`/admins/${created.body.data._id}`).send({ permissions: ['analytics.view'] }).expect(200);
    const ops2 = await login('ops@test.in', 'Ops@12345');
    await api(ops2).get('/analytics/revenue').expect(200);
  });

  test('cannot remove the last super admin', async () => {
    const token = await login();
    const me = await api(token).get('/auth/me');
    await api(token).delete(`/admins/${me.body.data.id}`).expect(400);
  });
});
