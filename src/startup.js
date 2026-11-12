'use strict';

const fs = require('fs');
const path = require('path');

// Production start-up checks. A production server must never fall back to a built-in
// secret, a default admin password, or a disk that is lost on redeploy — so instead
// of guessing, it refuses to start and says exactly what to set.
function productionProblems(env, { hasStoredPassword = false, canWriteDataDir = true, dataDirIsPseudo = false } = {}) {
  const problems = [];
  const secret = env.SESSION_SECRET || '';
  if (!secret) problems.push('SESSION_SECRET is not set. Use a long random value (at least 32 characters).');
  else if (secret.length < 32) problems.push('SESSION_SECRET is too short. Use at least 32 random characters.');

  if (!env.DATA_DIR) problems.push('DATA_DIR is not set. Point it at a persistent, writable folder (admin edits and a changed password are saved there).');
  else if (dataDirIsPseudo) problems.push(`DATA_DIR (${env.DATA_DIR}) is under /proc, /sys or /dev, which are not real disks. Point it at a persistent volume instead.`);
  else if (!canWriteDataDir) problems.push(`DATA_DIR (${env.DATA_DIR}) is not writable. Mount a persistent volume there and make it writable by the app user.`);

  const adminPassword = env.ADMIN_PASSWORD || '';
  if (!adminPassword && !hasStoredPassword) problems.push('ADMIN_PASSWORD is not set, so nobody could log in to the admin panel. Set it to a strong password (at least 8 characters).');
  else if (adminPassword && adminPassword.length < 8) problems.push('ADMIN_PASSWORD is too short. Use at least 8 characters.');
  return problems;
}

// Kernel pseudo-filesystems. Files there aren't stored on disk, and opening or writing
// some of them can block forever, so a data folder must never be placed under them.
const PSEUDO_FS_ROOTS = ['/proc', '/sys', '/dev'];

function isPseudoFsPath(resolvedPath) {
  return PSEUDO_FS_ROOTS.some((root) => resolvedPath === root || resolvedPath.startsWith(root + '/'));
}

// The folder's real location: the deepest part that already exists with symlinks
// resolved (so a link into /proc is seen for what it is), plus the part still to create.
function resolveThroughSymlinks(dir) {
  let current = path.resolve(dir);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest.reverse());
    } catch (err) {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(dir);
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

function isPseudoFsDir(dir) {
  return process.platform !== 'win32' && isPseudoFsPath(resolveThroughSymlinks(dir));
}

function isWritableDir(dir) {
  if (isPseudoFsDir(dir)) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    // 'wx' creates a brand-new file or fails — it never opens something that already exists.
    fs.writeFileSync(probe, 'ok', { flag: 'wx' });
    fs.unlinkSync(probe);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { productionProblems, isWritableDir, isPseudoFsPath, isPseudoFsDir, resolveThroughSymlinks };
