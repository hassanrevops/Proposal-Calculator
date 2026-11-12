'use strict';

const fs = require('fs');
const path = require('path');

// Production start-up checks. A production server must never fall back to a built-in
// secret, a default admin password, or a disk that is lost on redeploy — so instead
// of guessing, it refuses to start and says exactly what to set.
function productionProblems(env, { hasStoredPassword = false, canWriteDataDir = true } = {}) {
  const problems = [];
  const secret = env.SESSION_SECRET || '';
  if (!secret) problems.push('SESSION_SECRET is not set. Use a long random value (at least 32 characters).');
  else if (secret.length < 32) problems.push('SESSION_SECRET is too short. Use at least 32 random characters.');

  if (!env.DATA_DIR) problems.push('DATA_DIR is not set. Point it at a persistent, writable folder (admin edits and a changed password are saved there).');
  else if (!canWriteDataDir) problems.push(`DATA_DIR (${env.DATA_DIR}) is not writable. Mount a persistent volume there and make it writable by the app user.`);

  const adminPassword = env.ADMIN_PASSWORD || '';
  if (!adminPassword && !hasStoredPassword) problems.push('ADMIN_PASSWORD is not set, so nobody could log in to the admin panel. Set it to a strong password (at least 8 characters).');
  else if (adminPassword && adminPassword.length < 8) problems.push('ADMIN_PASSWORD is too short. Use at least 8 characters.');
  return problems;
}

function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { productionProblems, isWritableDir };
