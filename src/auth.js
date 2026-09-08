'use strict';

const crypto = require('crypto');

// Only used outside production, and only when ADMIN_PASSWORD hasn't been set —
// gives a working admin login on a fresh dev checkout without any setup step.
const DEV_DEFAULT_PASSWORD = 'welcome123';

let currentPasswordHash = null;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function hash(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function getConfiguredHash() {
  if (currentPasswordHash) return currentPasswordHash;
  if (process.env.ADMIN_PASSWORD) return hash(process.env.ADMIN_PASSWORD);
  if (!isProduction()) return hash(DEV_DEFAULT_PASSWORD);
  return null; // production, nothing configured — no insecure default
}

function verifyPassword(candidate) {
  if (!candidate) return false;
  const expected = getConfiguredHash();
  if (!expected) return false;
  return hash(candidate) === expected;
}

function changePassword(currentPassword, newPassword) {
  if (!verifyPassword(currentPassword)) {
    throw new Error('Current password is incorrect');
  }
  if (!newPassword || String(newPassword).length < 8) {
    throw new Error('New password must be at least 8 characters');
  }
  currentPasswordHash = hash(newPassword);
  return true;
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/admin/login');
  }
  return next();
}

module.exports = { verifyPassword, changePassword, requireAuth, DEV_DEFAULT_PASSWORD };
