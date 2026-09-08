'use strict';

const { DEFAULT_CONFIG } = require('./pricing');

// In-memory fallback store, used whenever no Redis connection is configured. In
// production this is NOT allowed to silently hold the live pricing config — admin
// edits would vanish on every restart/deploy with no warning, so saveConfig throws
// instead of falling back there.
let memoryStore = null;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['config must be an object'] };
  }
  if (!Array.isArray(config.volumeTiers) || config.volumeTiers.length === 0) {
    errors.push('volumeTiers must be a non-empty array');
  }
  if (!config.categoryWeights || typeof config.categoryWeights !== 'object') {
    errors.push('categoryWeights must be an object');
  }
  if (!config.yearTable || typeof config.yearTable !== 'object') {
    errors.push('yearTable must be an object');
  }
  if (typeof config.defaultPricingYear !== 'number' || !Number.isFinite(config.defaultPricingYear)) {
    errors.push('defaultPricingYear must be a number');
  } else if (config.yearTable && !(config.defaultPricingYear in config.yearTable)) {
    errors.push('defaultPricingYear must be a key present in yearTable');
  }
  if (config.categoryWeights) {
    for (const [tier, weight] of Object.entries(config.categoryWeights)) {
      if (typeof weight !== 'number' || weight < 0 || weight > 1) {
        errors.push(`categoryWeights.${tier} must be a number between 0 and 1`);
      }
    }
  }
  if (Array.isArray(config.volumeTiers)) {
    for (const tier of config.volumeTiers) {
      if (typeof tier.discountVsPrev !== 'number' || tier.discountVsPrev < 0 || tier.discountVsPrev > 1) {
        errors.push('every volumeTiers[].discountVsPrev must be between 0 and 1');
        break;
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

async function getConfig() {
  if (memoryStore) return memoryStore;
  // A real deployment would read from Redis here (REDIS_URL). With no store
  // configured yet, every request falls back to the built-in defaults.
  return DEFAULT_CONFIG;
}

async function saveConfig(config) {
  const { valid, errors } = validateConfig(config);
  if (!valid) {
    throw new Error(`Invalid config: ${errors.join('; ')}`);
  }
  if (isProduction() && !process.env.REDIS_URL) {
    throw new Error('Refusing to save config in production with no persistent store (REDIS_URL) configured — this would silently vanish on the next restart.');
  }
  memoryStore = config;
  return memoryStore;
}

module.exports = { getConfig, saveConfig, validateConfig };
