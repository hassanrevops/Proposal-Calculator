'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./pricing');

// Admin edits are written to a JSON file so they survive restarts and redeploys.
// Point DATA_DIR at a persistent volume in production — on a host with an ephemeral
// disk, anything written under the default ./data folder is lost on redeploy.
function dataDir() {
  return process.env.DATA_DIR || path.join(__dirname, '..', 'data');
}

function configFile() {
  return path.join(dataDir(), 'config.json');
}

let cache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateBands(bands, label, errors) {
  if (!Array.isArray(bands) || bands.length === 0) {
    errors.push(`${label}: needs at least one band`);
    return;
  }
  let prevTo = 0;
  bands.forEach((b, i) => {
    if (typeof b.from !== 'number' || !Number.isFinite(b.from) || b.from < 1) {
      errors.push(`${label}: band ${i + 1} needs a "from" of at least 1`);
      return;
    }
    if (typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate < 0) {
      errors.push(`${label}: band ${i + 1} needs a rate of 0 or more`);
    }
    if (b.from <= prevTo) errors.push(`${label}: band ${i + 1} overlaps the band before it`);
    if (b.to != null) {
      if (typeof b.to !== 'number' || !Number.isFinite(b.to) || b.to < b.from) {
        errors.push(`${label}: band ${i + 1} ends before it starts`);
        return;
      }
      prevTo = b.to;
    } else if (i !== bands.length - 1) {
      errors.push(`${label}: only the last band can have no upper limit`);
    } else {
      prevTo = Infinity;
    }
  });
}

function validateProducts(products, errors) {
  if (!Array.isArray(products) || products.length === 0) {
    errors.push('products must be a non-empty array');
    return;
  }
  const seen = new Set();
  for (const p of products) {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9_]+$/.test(p.id)) {
      errors.push('every product needs an id made of lowercase letters, numbers or underscores');
      continue;
    }
    if (seen.has(p.id)) errors.push(`duplicate product id "${p.id}"`);
    seen.add(p.id);
    if (!p.name || typeof p.name !== 'string') errors.push(`${p.id}: name is required`);
    if (p.model === 'banded_pec' || p.model === 'flat_band') {
      validateBands(p.bands, p.name || p.id, errors);
      for (const k of ['freeCap', 'customAbove']) {
        if (p[k] != null && (typeof p[k] !== 'number' || p[k] < 0)) errors.push(`${p.name || p.id}: ${k} must be a number of 0 or more`);
      }
    } else if (p.model === 'studio_plan') {
      for (const k of ['cogsCourse', 'cogsPlayback', 'extraSeat']) {
        if (typeof p[k] !== 'number' || p[k] < 0) errors.push(`${p.name}: ${k} must be a number of 0 or more`);
      }
      if (!Array.isArray(p.plans) || p.plans.length === 0) errors.push(`${p.name}: needs at least one plan`);
      else {
        for (const pl of p.plans) {
          if (!pl.id || !pl.label) errors.push(`${p.name}: every plan needs an id and a label`);
          for (const k of ['seats', 'coursesMo', 'playbackMo', 'mult']) {
            if (typeof pl[k] !== 'number' || pl[k] < 0) errors.push(`${p.name} plan ${pl.label || pl.id}: ${k} must be a number of 0 or more`);
          }
        }
      }
    } else if (p.model !== 'lms_marginal') {
      errors.push(`${p.name || p.id}: unknown pricing model "${p.model}"`);
    }
  }
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
  const split = config.lmsSplit;
  if (!split || typeof split.library !== 'number' || typeof split.lms !== 'number'
      || split.library < 0 || split.lms < 0 || Math.abs(split.library + split.lms - 1) > 0.001) {
    errors.push('lmsSplit: the Library and LMS shares must each be 0 or more and add up to 100%');
  }
  validateProducts(config.products, errors);
  return { valid: errors.length === 0, errors };
}

function loadFromDisk() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read saved pricing config, using defaults:', err.message);
  }
  return { ...clone(DEFAULT_CONFIG), ...stored };
}

async function getConfig() {
  if (!cache) cache = loadFromDisk();
  return cache;
}

// Merges the incoming fields onto the current config, so each admin page can save
// just its own section without wiping the others.
async function saveConfig(partial) {
  const merged = { ...(await getConfig()), ...partial };
  const { valid, errors } = validateConfig(merged);
  if (!valid) {
    throw new Error(`Invalid config: ${errors.join('; ')}`);
  }
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = `${configFile()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
    fs.renameSync(tmp, configFile());
  } catch (err) {
    throw new Error(`Could not save the pricing config to ${configFile()} (${err.message}). Make sure DATA_DIR points at a writable, persistent folder.`);
  }
  cache = merged;
  return cache;
}

function resetCacheForTests() {
  cache = null;
}

module.exports = { getConfig, saveConfig, validateConfig, resetCacheForTests };
