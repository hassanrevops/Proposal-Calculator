'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-startup-'));

const { productionProblems, isWritableDir } = require('../src/startup');
const { loginLockedFor, recordFailedLogin, clearFailedLogins, MAX_FAILED_LOGINS, LOCKOUT_MS, verifyPassword } = require('../src/auth');

const good = { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), DATA_DIR: '/data', ADMIN_PASSWORD: 'a-strong-password' };

test('production start-up accepts a complete, strong configuration', () => {
  assert.deepEqual(productionProblems(good), []);
});

test('production start-up names every missing or weak setting', () => {
  const none = productionProblems({ NODE_ENV: 'production' });
  assert.equal(none.length, 3);
  assert.ok(none.some((p) => /SESSION_SECRET is not set/.test(p)));
  assert.ok(none.some((p) => /DATA_DIR is not set/.test(p)));
  assert.ok(none.some((p) => /ADMIN_PASSWORD is not set/.test(p)));
  assert.ok(productionProblems({ ...good, SESSION_SECRET: 'short' }).some((p) => /too short/.test(p)));
  assert.ok(productionProblems({ ...good, ADMIN_PASSWORD: 'abc' }).some((p) => /ADMIN_PASSWORD is too short/.test(p)));
  assert.ok(productionProblems(good, { canWriteDataDir: false }).some((p) => /not writable/.test(p)));
});

test('an already-saved admin password makes ADMIN_PASSWORD optional', () => {
  const { ADMIN_PASSWORD, ...withoutPassword } = good; // eslint-disable-line no-unused-vars
  assert.deepEqual(productionProblems(withoutPassword, { hasStoredPassword: true }), []);
  assert.equal(productionProblems(withoutPassword, { hasStoredPassword: false }).length, 1);
});

test('the data folder check tells a writable folder from an unusable one', () => {
  assert.equal(isWritableDir(path.join(process.env.DATA_DIR, 'ok')), true);
  const file = path.join(process.env.DATA_DIR, 'a-file');
  fs.writeFileSync(file, 'x');
  assert.equal(isWritableDir(path.join(file, 'inside')), false);
});

test('there is no default admin password in production', () => {
  const before = { NODE_ENV: process.env.NODE_ENV, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_PASSWORD;
    assert.equal(verifyPassword('welcome123'), false);
    assert.equal(verifyPassword(''), false);
    process.env.ADMIN_PASSWORD = 'prod-password-1';
    assert.equal(verifyPassword('prod-password-1'), true);
    assert.equal(verifyPassword('welcome123'), false);
    assert.equal(verifyPassword(['prod-password-1']), false);
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('login lockout: locks after the limit, expires, and a success clears it', () => {
  const ip = '203.0.113.9';
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) recordFailedLogin(ip, t0 + i);
  assert.equal(loginLockedFor(ip, t0 + 100), 0, 'not locked yet');
  recordFailedLogin(ip, t0 + 200);
  assert.ok(loginLockedFor(ip, t0 + 300) > 0, 'locked at the limit');
  assert.equal(loginLockedFor('198.51.100.1', t0 + 300), 0, 'other addresses are unaffected');
  assert.equal(loginLockedFor(ip, t0 + LOCKOUT_MS + 1000), 0, 'lock expires');
  for (let i = 0; i < MAX_FAILED_LOGINS; i++) recordFailedLogin(ip, t0 + LOCKOUT_MS * 3 + i);
  clearFailedLogins(ip);
  assert.equal(loginLockedFor(ip, t0 + LOCKOUT_MS * 3 + 50), 0, 'success clears the count');
});
