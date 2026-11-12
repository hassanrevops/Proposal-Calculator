'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-config-'));

const {
  DEFAULT_CONFIG,
  computeAll5CategoryBasePrice,
  buildProposalNumbers,
  buildMultiCategoryProposalNumbers,
} = require('../src/pricing');
const { computeDeal, getCatalog } = require('../src/calculator');
const { proposalProductList, resolveProposalProduct } = require('../src/products');
const { getConfig, saveConfig, validateConfig, resetCacheForTests } = require('../src/config-store');

const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

function deal(overrides = {}, products = {}) {
  return computeDeal({ headcount: 750, nonprofit: 0, years: 1, products, ...overrides }, config);
}
function line(result, id) {
  return result.lines.find((l) => l.id === id);
}

test('calculator LMS base price matches the proposal generator for every deal size', () => {
  for (const n of [5, 15, 20, 21, 100, 750, 5000, 120000]) {
    const calc = line(deal({ headcount: n }, { lms: { content: 'all5' } }), 'lms');
    const proposal = computeAll5CategoryBasePrice(n, config.defaultPricingYear, false, 0, config);
    assert.ok(Math.abs(calc.perUnit - proposal) < 1e-9, `${n} licenses: ${calc.perUnit} vs ${proposal}`);
  }
});

test('calculator non-profit % lowers the LMS price but not the small-deal flat price', () => {
  const full = line(deal({ headcount: 100 }, { lms: { content: 'all5' } }), 'lms').perUnit;
  const np = line(deal({ headcount: 100, nonprofit: 10 }, { lms: { content: 'all5' } }), 'lms').perUnit;
  assert.ok(Math.abs(np - full * 0.9) < 1e-9);
  const smallFull = line(deal({ headcount: 15 }, { lms: { content: 'all5' } }), 'lms').perUnit;
  const smallNp = line(deal({ headcount: 15, nonprofit: 10 }, { lms: { content: 'all5' } }), 'lms').perUnit;
  assert.equal(smallFull, smallNp);
});

test('LMS splits 60% Library / 40% platform, and the content tier only scales the Library', () => {
  const all5 = line(deal({}, { lms: { content: 'all5' } }), 'lms');
  const three = line(deal({}, { lms: { content: '3cat' } }), 'lms');
  assert.ok(Math.abs(all5.libAnnual / all5.annualList - 0.6) < 1e-9);
  assert.ok(Math.abs(three.lmsAnnual - all5.lmsAnnual) < 1e-9);
  assert.ok(Math.abs(three.libAnnual - all5.libAnnual * 0.8) < 1e-9);
  const content = line(deal({}, { lms: { content: 'all5', lmsMode: 'content' } }), 'lms');
  const lmsOnly = line(deal({}, { lms: { content: 'all5', lmsMode: 'lms' } }), 'lms');
  assert.ok(Math.abs(content.annualList + lmsOnly.annualList - all5.annualList) < 1e-6);
});

test('banded products charge one rate for the whole headcount band', () => {
  const r = deal({ headcount: 750 });
  assert.equal(line(r, 'safety').annualList, 35 * 750);
  assert.equal(line(r, 'skills').annualList, 28 * 750);
  assert.equal(line(r, 'phishing').annualList, 26 * 750);
  assert.equal(line(r, 'performance').annualList, 65 * 750);
});

test('KC Map is a flat fee by size band, and KC Studio Pro/Max follow cost-plus-markup', () => {
  const r = deal({ headcount: 750 });
  assert.equal(line(r, 'kmap').annualList, 22000);
  assert.equal(line(r, 'studio').annualList, (30 * 12 * 3 + 500 * 0.1) * 10);
  const max = line(deal({}, { studio: { plan: 'max', xSeats: 2 } }), 'studio');
  assert.equal(max.annualList, (100 * 12 * 3 + 2000 * 0.1) * 7 + 2 * 200);
});

test('KC Talent meters on people assessed (starts at 0), not headcount', () => {
  assert.equal(line(deal({ headcount: 9999 }), 'talent').annualList, 0);
  assert.equal(line(deal({ headcount: 9999 }, { talent: { override: 300 } }), 'talent').annualList, 38 * 300);
  assert.equal(line(deal({}, { talent: { override: 1500 } }), 'talent').annualList, 15 * 1500);
});

test('free tiers cost $0, and an excluded product drops out of the totals', () => {
  const r = deal({ headcount: 8 });
  assert.equal(line(r, 'safety').free, true);
  assert.equal(line(r, 'safety').annual, 0);
  const without = deal({}, { safety: { include: false } });
  const withIt = deal();
  assert.equal(withIt.annual - without.annual, line(withIt, 'safety').annual);
});

test('discounts compound (multi-year then offer), then the flat special $ comes off', () => {
  const r = deal({ years: 3 }, { safety: { multiYear: { 3: 30 }, offer: 30, special: 100 } });
  const l = line(r, 'safety');
  assert.ok(Math.abs(l.effPct - 51) < 1e-9);
  assert.ok(Math.abs(l.annual - (26250 * 0.49 - 100)) < 1e-9);
  assert.ok(Math.abs(l.tcv - l.annual * 3) < 1e-9);
});

test('multi-year defaults come from the shared admin setting and can be overridden per product', () => {
  const dflt = line(deal({ years: 5 }), 'safety');
  assert.equal(dflt.myPct, 40);
  const custom = line(deal({ years: 5 }, { safety: { multiYear: { 5: 25 } } }), 'safety');
  assert.equal(custom.myPct, 25);
  assert.equal(line(deal({ years: 1 }), 'safety').myPct, 0);
});

test('catalog exposes the enabled products and the LMS content tiers', () => {
  const catalog = getCatalog(config);
  assert.deepEqual(catalog.products.map((p) => p.id), ['lms', 'safety', 'skills', 'kmap', 'phishing', 'studio', 'performance', 'talent']);
  assert.equal(catalog.contentTiers.length, 6);
  assert.equal(catalog.multiYearDefaults[3], 30);
});

test('Products dropdown lists LMS tiers, then every other product (Studio per plan)', () => {
  const list = proposalProductList(config);
  assert.deepEqual(list.slice(0, 6).map((p) => p.id), ['all5', '4cat', '3cat', '2cat', '1cat', '1to2courses']);
  assert.ok(list.slice(0, 6).every((p) => p.group === 'KC LMS + Library'));
  const others = list.slice(6).map((p) => p.id);
  assert.deepEqual(others, ['safety', 'skills', 'kmap', 'phishing', 'studio:pro', 'studio:max', 'performance', 'talent']);
  assert.equal(resolveProposalProduct('nope', config), null);
});

test('proposal rows: banded products keep price x licenses = sub-total exactly', () => {
  const n = buildProposalNumbers({ licenses: 500, categoryTier: 'safety', pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0.3 }, config);
  assert.equal(n.costPerUser1Yr, 42);
  assert.equal(n.afterDiscountCostPerUser, 29.4);
  assert.equal(n.subTotal, 14700);
  assert.equal(n.multiYear['3yr'], 10290);
});

test('proposal rows: flat-fee products show an effective per-user rate but bill the real fee', () => {
  const map = buildProposalNumbers({ licenses: 500, categoryTier: 'kmap', pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0.3 }, config);
  assert.equal(map.costPerUser1Yr, 24);
  assert.equal(map.subTotal, 8400);
  const pro = buildProposalNumbers({ licenses: 2, categoryTier: 'studio:pro', pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0 }, config);
  assert.equal(pro.subTotal, 11300);
  assert.equal(pro.costPerUser1Yr, 5650);
  const extra = buildProposalNumbers({ licenses: 5, categoryTier: 'studio:pro', pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0 }, config);
  assert.equal(extra.subTotal, 11300 + 3 * 200);
});

test('proposal rows: an unknown product is rejected instead of pricing as NaN', () => {
  assert.throws(() => buildProposalNumbers({ licenses: 5, categoryTier: 'bogus', pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0 }, config), /Unknown product/);
});

test('holistic: LMS tiers share one combined-volume price, other products price on their own count', () => {
  const mixed = buildMultiCategoryProposalNumbers({
    lineItems: [
      { licenseCount: 300, categoryTier: '2cat' },
      { licenseCount: 200, categoryTier: '1cat' },
      { licenseCount: 500, categoryTier: 'safety' },
    ],
    pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0,
  }, config);
  const lmsOnly = buildMultiCategoryProposalNumbers({
    lineItems: [{ licenseCount: 300, categoryTier: '2cat' }, { licenseCount: 200, categoryTier: '1cat' }],
    pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0,
  }, config);
  assert.equal(mixed.rows[0].subTotal, lmsOnly.rows[0].subTotal);
  assert.equal(mixed.rows[1].subTotal, lmsOnly.rows[1].subTotal);
  assert.equal(mixed.rows[2].costPerUser1Yr, 42);
  assert.equal(mixed.rows[2].subTotal, 21000);
});

test('config validation rejects overlapping bands and a split that is not 100%', () => {
  const bad = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  bad.products.find((p) => p.id === 'safety').bands[1].from = 5;
  assert.equal(validateConfig(bad).valid, false);
  const badSplit = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  badSplit.lmsSplit = { library: 0.7, lms: 0.4 };
  assert.equal(validateConfig(badSplit).valid, false);
  assert.equal(validateConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG))).valid, true);
});

test('saving a partial config merges, persists to disk, and survives a reload', async () => {
  resetCacheForTests();
  const before = await getConfig();
  const products = JSON.parse(JSON.stringify(before.products));
  products.find((p) => p.id === 'safety').bands[0].rate = 99;
  await saveConfig({ products });
  const saved = await getConfig();
  assert.equal(saved.volumeTiers.length, before.volumeTiers.length, 'other sections are untouched');
  resetCacheForTests();
  const reloaded = await getConfig();
  assert.equal(reloaded.products.find((p) => p.id === 'safety').bands[0].rate, 99);
  await assert.rejects(saveConfig({ lmsSplit: { library: 0.9, lms: 0.9 } }), /Invalid config/);
});
