'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Only used outside production, and only when ADMIN_PASSWORD hasn't been set —
// gives a working admin login on a fresh dev checkout without any setup step.
const DEV_DEFAULT_PASSWORD = 'welcome123';

function authFile() {
  return path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'auth.json');
}

// A password changed from the admin panel is stored (as a hash) next to the pricing
// config, so it survives a restart. It takes priority over ADMIN_PASSWORD.
function readStoredHash() {
  try {
    return JSON.parse(fs.readFileSync(authFile(), 'utf8')).passwordHash || null;
  } catch (err) {
    return null;
  }
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function hash(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function getConfiguredHash() {
  const stored = readStoredHash();
  if (stored) return stored;
  if (process.env.ADMIN_PASSWORD) return hash(process.env.ADMIN_PASSWORD);
  if (!isProduction()) return hash(DEV_DEFAULT_PASSWORD);
  return null; // production, nothing configured — no insecure default
}

function verifyPassword(candidate) {
  if (!candidate || typeof candidate !== 'string' || candidate.length > 1000) return false;
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
  try {
    fs.mkdirSync(path.dirname(authFile()), { recursive: true });
    fs.writeFileSync(authFile(), JSON.stringify({ passwordHash: hash(newPassword) }));
  } catch (err) {
    throw new Error(`Could not save the new password (${err.message}). Make sure DATA_DIR points at a writable, persistent folder.`);
  }
  return true;
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/admin/login');
  }
  return next();
}

// For fetch() calls: a redirect to the login page would be followed silently and look
// like a success, so an ended session gets an explicit 401 instead.
function requireAuthApi(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Your admin session has ended. Please log in again.' });
  }
  return next();
}

module.exports = { verifyPassword, changePassword, requireAuth, requireAuthApi, DEV_DEFAULT_PASSWORD };
