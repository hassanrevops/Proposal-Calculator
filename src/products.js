'use strict';

// Product catalog (seed/default config) for the unified pricing calculator, plus
// the pricing rules for every non-LMS product. Bands use `to: null` for "no upper
// limit". The LMS entry carries only display info — its pricing comes from the
// shared LMS settings (volume tiers, year table, add-on %) used by the proposal
// generator, so both tools always agree on the base LMS price.
const DEFAULT_PRODUCTS = [
  { id: 'lms', name: 'KC LMS + Library', short: 'LMS', color: '#2563eb', enabled: true,
    desc: 'Learning platform + content library', model: 'lms_marginal', unit: 'user' },

  { id: 'safety', name: 'KC Safety', short: 'SF', color: '#0ea5a5', enabled: true,
    desc: 'Incident management & EHS', model: 'banded_pec', unit: 'employee',
    freeCap: 10, freeCapUnit: 'employees', customAbove: 25000,
    bands: [
      { from: 1, to: 10, rate: 70 }, { from: 11, to: 25, rate: 70 }, { from: 26, to: 100, rate: 60 },
      { from: 101, to: 250, rate: 50 }, { from: 251, to: 500, rate: 42 }, { from: 501, to: 1000, rate: 35 },
      { from: 1001, to: 2500, rate: 28 }, { from: 2501, to: 5000, rate: 22 }, { from: 5001, to: 10000, rate: 16 },
      { from: 10001, to: 25000, rate: 12 }, { from: 25001, to: null, rate: 12 },
    ] },

  { id: 'skills', name: 'KC Skills', short: 'SK', color: '#7c3aed', enabled: true,
    desc: 'Skill Assessment Manager (SAM)', model: 'banded_pec', unit: 'employee',
    freeCap: 5, freeCapUnit: 'seats', customAbove: 25000,
    bands: [
      { from: 1, to: 25, rate: 45 }, { from: 26, to: 100, rate: 40 }, { from: 101, to: 250, rate: 36 },
      { from: 251, to: 500, rate: 32 }, { from: 501, to: 1000, rate: 28 }, { from: 1001, to: 2500, rate: 22 },
      { from: 2501, to: 5000, rate: 17 }, { from: 5001, to: 10000, rate: 12 }, { from: 10001, to: 25000, rate: 8 },
      { from: 25001, to: null, rate: 8 },
    ] },

  { id: 'kmap', name: 'KC Map', short: 'MP', color: '#ea580c', enabled: true,
    desc: 'Competency Mapper — flat fee by company size', model: 'flat_band', unit: 'employee',
    customAbove: 25000,
    bands: [
      { from: 1, to: 25, rate: 1500 }, { from: 26, to: 100, rate: 3000 }, { from: 101, to: 250, rate: 7000 },
      { from: 251, to: 500, rate: 12000 }, { from: 501, to: 1000, rate: 22000 }, { from: 1001, to: 2500, rate: 36000 },
      { from: 2501, to: 5000, rate: 55000 }, { from: 5001, to: 10000, rate: 80000 }, { from: 10001, to: 25000, rate: 120000 },
      { from: 25001, to: null, rate: 120000 },
    ] },

  { id: 'phishing', name: 'KC Phishing', short: 'PH', color: '#dc2626', enabled: true,
    desc: 'Phishing simulation + awareness', model: 'banded_pec', unit: 'employee',
    customAbove: 25000,
    bands: [
      { from: 1, to: 25, rate: 34 }, { from: 26, to: 100, rate: 30 }, { from: 101, to: 250, rate: 28 },
      { from: 251, to: 500, rate: 27 }, { from: 501, to: 1000, rate: 26 }, { from: 1001, to: 2500, rate: 22 },
      { from: 2501, to: 5000, rate: 18 }, { from: 5001, to: 10000, rate: 14 }, { from: 10001, to: 25000, rate: 10 },
      { from: 25001, to: null, rate: 10 },
    ] },

  // KC Studio: cost + markup. price = (courses/yr x cogsCourse + playback credits x
  // cogsPlayback) x plan multiplier + extra seats x extraSeat (flat, not marked up).
  { id: 'studio', name: 'KC Studio', short: 'ST', color: '#4f46e5', enabled: true,
    desc: 'AI course creation — avatars, dubbing, SCORM/LTI', model: 'studio_plan', unit: 'course',
    cogsCourse: 3, cogsPlayback: 0.10, extraSeat: 200,
    plans: [
      { id: 'pro', label: 'Pro', seats: 2, coursesMo: 30, playbackMo: 500, mult: 10 },
      { id: 'max', label: 'Max', seats: 5, coursesMo: 100, playbackMo: 2000, mult: 7 },
    ] },

  { id: 'performance', name: 'KC Performance', short: 'PF', color: '#059669', enabled: true,
    desc: 'Enterprise performance management', model: 'banded_pec', unit: 'employee',
    freeCap: 10, freeCapUnit: 'employees', customAbove: 25000,
    bands: [
      { from: 1, to: 10, rate: 100 }, { from: 11, to: 25, rate: 100 }, { from: 26, to: 100, rate: 90 },
      { from: 101, to: 250, rate: 80 }, { from: 251, to: 500, rate: 76 }, { from: 501, to: 1000, rate: 65 },
      { from: 1001, to: 2500, rate: 50 }, { from: 2501, to: 5000, rate: 42 }, { from: 5001, to: 10000, rate: 34 },
      { from: 10001, to: 25000, rate: 26 }, { from: 25001, to: null, rate: 26 },
    ] },

  // KC Talent: per PERSON assessed per year (employees + candidates on one meter).
  { id: 'talent', name: 'KC Talent', short: 'TA', color: '#d97706', enabled: true,
    desc: 'Psychometric assessment — employees + candidates', model: 'banded_pec', unit: 'person',
    seatBased: true, defaultSeats: 0, overrideLabel: '# People assessed / yr',
    freeCap: 10, freeCapUnit: 'people/yr', customAbove: 5000,
    bands: [
      { from: 1, to: 100, rate: 45 }, { from: 101, to: 300, rate: 38 }, { from: 301, to: 600, rate: 30 },
      { from: 601, to: 1000, rate: 23 }, { from: 1001, to: 2500, rate: 15 }, { from: 2501, to: 5000, rate: 11 },
      { from: 5001, to: null, rate: 11 },
    ] },
];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// One rate for the whole count: the band the TOTAL falls in (not marginal).
function bandRate(bands, n) {
  for (const b of bands) {
    const to = b.to == null ? Infinity : b.to;
    if (n >= b.from && n <= to) return b.rate;
  }
  return bands.length ? bands[bands.length - 1].rate : 0;
}

function getProduct(config, id) {
  return (config.products || []).find((p) => p.id === id);
}

// KC Studio's annual list price, with optional extras (all default to 0).
function studioAnnual(product, plan, extras = {}) {
  const xSeats = Math.max(0, Math.floor(+extras.xSeats || 0));
  const xCourses = Math.max(0, Math.floor(+extras.xCourses || 0));
  const xPlay = Math.max(0, Math.floor(+extras.xPlay || 0));
  const coursesYr = plan.coursesMo * 12 + xCourses;
  const playback = plan.playbackMo + xPlay;
  const courseCost = coursesYr * product.cogsCourse;
  const playbackCost = playback * product.cogsPlayback;
  const cogs = courseCost + playbackCost;
  const seatsCharge = xSeats * product.extraSeat;
  return {
    xSeats, xCourses, xPlay, coursesYr, playback, courseCost, playbackCost, cogs, seatsCharge,
    seats: plan.seats + xSeats,
    annualList: cogs * plan.mult + seatsCharge,
  };
}

// ---------------------------------------------------------------------------
// Proposal-generator "Products" dropdown. LMS keeps its existing category tiers
// (All 5 Categories ... 1-2 Courses); every other enabled product is one entry,
// except KC Studio, which is one entry per plan (Pro / Max).
// ---------------------------------------------------------------------------

function proposalProductList(config) {
  const list = [];
  const lms = getProduct(config, 'lms');
  if (!lms || lms.enabled !== false) {
    const group = lms ? lms.name : 'KC LMS + Library';
    for (const key of Object.keys(config.categoryWeights)) {
      list.push({ id: key, label: (config.categoryDisplayNames && config.categoryDisplayNames[key]) || key, group });
    }
  }
  for (const p of config.products || []) {
    if (p.id === 'lms' || p.enabled === false) continue;
    if (p.model === 'studio_plan') {
      for (const plan of p.plans) list.push({ id: `${p.id}:${plan.id}`, label: `${p.name} ${plan.label}`, group: 'Other products' });
    } else {
      list.push({ id: p.id, label: p.name, group: 'Other products' });
    }
  }
  return list;
}

// Maps a dropdown value to either an LMS category tier or a catalog product.
function resolveProposalProduct(id, config) {
  if (Object.prototype.hasOwnProperty.call(config.categoryWeights, id)) return { kind: 'lms', tier: id };
  const [productId, planId] = String(id).split(':');
  const product = getProduct(config, productId);
  if (!product || product.id === 'lms' || product.enabled === false) return null;
  if (product.model === 'studio_plan') {
    const plan = product.plans.find((pl) => pl.id === planId) || null;
    if (!plan) return null;
    return { kind: 'product', product, plan };
  }
  return { kind: 'product', product, plan: null };
}

function proposalLabel(id, config) {
  if (Object.prototype.hasOwnProperty.call(config.categoryWeights, id)) {
    return (config.categoryDisplayNames && config.categoryDisplayNames[id]) || id;
  }
  const target = resolveProposalProduct(id, config);
  if (!target) return id;
  return target.plan ? `${target.product.name} ${target.plan.label}` : target.product.name;
}

// Annual LIST price for one proposal row. `flat` rows (KC Map, KC Studio) have a
// fixed annual fee that isn't count x rate, so the caller derives an effective
// per-user figure for display.
function priceProposalRow(target, licenses) {
  const { product, plan } = target;
  if (product.model === 'studio_plan') {
    const extraSeats = Math.max(0, licenses - plan.seats);
    return { annualList: studioAnnual(product, plan, { xSeats: extraSeats }).annualList, flat: true, free: false };
  }
  if (product.freeCap && licenses <= product.freeCap) return { annualList: 0, perUnit: 0, flat: false, free: true };
  if (product.model === 'flat_band') return { annualList: bandRate(product.bands, licenses), flat: true, free: false };
  const perUnit = bandRate(product.bands, licenses);
  return { annualList: perUnit * licenses, perUnit, flat: false, free: false };
}

module.exports = {
  DEFAULT_PRODUCTS,
  round2,
  bandRate,
  getProduct,
  studioAnnual,
  proposalProductList,
  resolveProposalProduct,
  proposalLabel,
  priceProposalRow,
};
