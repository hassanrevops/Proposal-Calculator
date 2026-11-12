'use strict';

const { computeAll5CategoryBasePriceWithPct } = require('./pricing');
const { bandRate, studioAnnual } = require('./products');

const YEAR_OPTIONS = [1, 2, 3, 5];
const LMS_MODES = [
  { id: 'both', label: 'LMS + Content' },
  { id: 'content', label: 'Content only' },
  { id: 'lms', label: 'LMS only' },
];
const DEFAULT_HEADCOUNT = 0;
const DEFAULT_CONTENT_TIER = '3cat';

function clamp(v, lo, hi) {
  v = +v || 0;
  return Math.min(hi, Math.max(lo, v));
}

// Default multi-year % by term, in percent, taken from the same admin setting the
// proposal generator's Multi-Year Agreements block uses.
function multiYearDefaults(config) {
  return {
    2: Math.round(config.multiYearDiscounts['2yr'] * 10000) / 100,
    3: Math.round(config.multiYearDiscounts['3yr'] * 10000) / 100,
    5: Math.round(config.multiYearDiscounts['5yr'] * 10000) / 100,
  };
}

function getCatalog(config) {
  const products = config.products
    .filter((p) => p.enabled !== false)
    .map((p) => ({
      id: p.id, name: p.name, short: p.short, color: p.color, desc: p.desc, model: p.model, unit: p.unit,
      seatBased: !!p.seatBased, defaultSeats: p.defaultSeats, overrideLabel: p.overrideLabel,
      freeCap: p.freeCap, freeCapUnit: p.freeCapUnit, customAbove: p.customAbove,
      extraSeat: p.extraSeat,
      plans: p.plans ? p.plans.map((pl) => ({ ...pl, basePrice: studioAnnual(p, pl).annualList })) : undefined,
    }));
  return {
    years: YEAR_OPTIONS,
    defaultHeadcount: DEFAULT_HEADCOUNT,
    multiYearDefaults: multiYearDefaults(config),
    lmsModes: LMS_MODES,
    contentTiers: Object.keys(config.categoryWeights).map((id) => ({
      id, label: (config.categoryDisplayNames && config.categoryDisplayNames[id]) || id, mult: config.categoryWeights[id],
    })),
    defaultContentTier: config.categoryWeights[DEFAULT_CONTENT_TIER] != null ? DEFAULT_CONTENT_TIER : Object.keys(config.categoryWeights)[0],
    products,
  };
}

function computeProduct(p, st, ctx, config) {
  const included = st.include !== false;
  const hasOverride = !(st.override === '' || st.override == null);
  const override = hasOverride ? Math.max(0, Math.floor(+st.override || 0)) : null;
  // Seat-based products meter on their own count (e.g. people assessed), not org headcount.
  const sharedDefault = p.seatBased ? (p.defaultSeats != null ? p.defaultSeats : 1) : (p.model === 'studio_plan' ? 1 : ctx.headcount);
  const covered = included ? (override == null ? sharedDefault : override) : 0;

  const r = {
    id: p.id, name: p.name, short: p.short, color: p.color, desc: p.desc, model: p.model, unit: p.unit,
    freeCapUnit: p.freeCapUnit, included, covered, perUnit: 0, annualList: 0, free: false, custom: false, flat: false,
    offerPct: 0, myPct: 0, effPct: 0, special: 0, annual: 0, tcv: 0,
  };
  if (!included || covered <= 0) return r;
  if ((p.model === 'banded_pec' || p.model === 'flat_band') && p.freeCap && covered <= p.freeCap) {
    r.free = true;
    return r;
  }

  if (p.model === 'lms_marginal') {
    const all5 = computeAll5CategoryBasePriceWithPct(covered, config.defaultPricingYear, ctx.nonprofit / 100, 0, config);
    const mode = LMS_MODES.some((m) => m.id === st.lmsMode) ? st.lmsMode : 'both';
    const tierWeight = config.categoryWeights[st.content];
    const contentMult = tierWeight != null ? tierWeight : 1;
    const libPriced = config.lmsSplit.library * all5 * contentMult;
    const lmsPart = config.lmsSplit.lms * all5;
    r.lmsMode = mode;
    r.perUnit = mode === 'content' ? libPriced : mode === 'lms' ? lmsPart : libPriced + lmsPart;
    r.libAnnual = (mode === 'lms' ? 0 : libPriced) * covered;
    r.lmsAnnual = (mode === 'content' ? 0 : lmsPart) * covered;
    r.annualList = r.perUnit * covered;
  } else if (p.model === 'flat_band') {
    r.flat = true;
    r.annualList = bandRate(p.bands, covered);
    r.perUnit = r.annualList / covered;
    if (p.customAbove && covered > p.customAbove) r.custom = true;
  } else if (p.model === 'studio_plan') {
    const plan = p.plans.find((pl) => pl.id === st.plan) || p.plans[0];
    const s = studioAnnual(p, plan, { xSeats: st.xSeats, xCourses: st.xCourses, xPlay: st.xPlay });
    Object.assign(r, {
      flat: true, plan: { id: plan.id, label: plan.label, seats: plan.seats }, mult: plan.mult,
      seats: s.seats, xSeats: s.xSeats, xCourses: s.xCourses, xPlay: s.xPlay, coursesYr: s.coursesYr,
      playback: s.playback, cogs: s.cogs, seatsCharge: s.seatsCharge,
    });
    r.covered = s.seats;
    r.annualList = s.annualList;
    r.perUnit = s.coursesYr > 0 ? s.annualList / s.coursesYr : 0;
  } else {
    r.perUnit = bandRate(p.bands, covered);
    if (p.customAbove && covered > p.customAbove) r.custom = true;
    r.annualList = r.perUnit * covered;
  }

  // Multi-year first, then the 1-year offer, compounding (30% then 30% = 51% off,
  // not 60%), then the flat special $ amount off the yearly price.
  r.offerPct = clamp(st.offer, 0, 100);
  r.myPct = ctx.years > 1 ? clamp(st.multiYear[ctx.years], 0, 100) : 0;
  const factor = (1 - r.offerPct / 100) * (1 - r.myPct / 100);
  r.effPct = (1 - factor) * 100;
  r.special = Math.max(0, +st.special || 0);
  r.annual = Math.max(0, r.annualList * factor - r.special);
  r.tcv = r.annual * ctx.years;

  if (p.model === 'lms_marginal' && r.annualList > 0) {
    r.libAnnualNet = Math.max(0, r.libAnnual * factor - r.special * (r.libAnnual / r.annualList));
    r.lmsAnnualNet = Math.max(0, r.lmsAnnual * factor - r.special * (r.lmsAnnual / r.annualList));
  }
  return r;
}

// Fills any missing per-product inputs with defaults, so a partial or older saved
// state from the browser still computes.
function normalizeProductState(raw, years, defaults, p, config) {
  const st = raw || {};
  const myRaw = st.multiYear || {};
  const multiYear = {};
  for (const y of [2, 3, 5]) {
    multiYear[y] = myRaw[y] === '' || myRaw[y] == null ? defaults[y] : +myRaw[y];
  }
  return {
    include: st.include !== false,
    override: st.override,
    content: st.content != null && config.categoryWeights[st.content] != null ? st.content : (config.categoryWeights[DEFAULT_CONTENT_TIER] != null ? DEFAULT_CONTENT_TIER : Object.keys(config.categoryWeights)[0]),
    lmsMode: st.lmsMode,
    offer: st.offer,
    multiYear,
    special: st.special,
    plan: st.plan,
    xSeats: st.xSeats,
    xCourses: st.xCourses,
    xPlay: st.xPlay,
  };
}

function computeDeal(state, config) {
  const s = state || {};
  const years = YEAR_OPTIONS.includes(+s.years) ? +s.years : 1;
  const ctx = {
    headcount: Math.max(0, Math.floor(+s.headcount || 0)),
    nonprofit: clamp(s.nonprofit, 0, 100),
    years,
  };
  const defaults = multiYearDefaults(config);
  const lines = config.products
    .filter((p) => p.enabled !== false)
    .map((p) => computeProduct(p, normalizeProductState((s.products || {})[p.id], years, defaults, p, config), ctx, config));

  const inc = lines.filter((l) => l.included && l.covered > 0);
  const sum = (k) => inc.reduce((a, l) => a + l[k], 0);
  const annual = sum('annual');
  return {
    ctx, years, lines,
    list: sum('annualList'),
    annual,
    tcv: sum('tcv'),
    blended: ctx.headcount ? annual / ctx.headcount : 0,
  };
}

module.exports = { getCatalog, computeDeal, YEAR_OPTIONS, LMS_MODES, DEFAULT_HEADCOUNT };
