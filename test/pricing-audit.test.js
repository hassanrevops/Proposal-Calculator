'use strict';

// Broader calculation audit. Originally written when a user reported that (in the
// Holistic path) 300 * $64.48 (the displayed, rounded-to-cents per-license price)
// didn't equal the displayed Sub-Total of $19,343.51 — at the time, the addendum
// kept full precision through the whole calculation and only rounded for display,
// so the TRUE per-license cost was $64.4783530391..., not $64.48. Per a later
// decision, every monetary figure is now rounded to cents as soon as it's computed
// and that rounded value feeds the next step (see buildProposalNumbers' and
// buildMultiCategoryProposalNumbers' doc comments in src/pricing.js) — so the
// displayed per-license price times the license count now equals the Sub-Total
// exactly, with no drift. These tests exist to give that regression coverage,
// plus a broader sweep of the pricing engine for genuine bugs.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeVolumeIndex,
  computeAll5CategoryBasePrice,
  computeCostPerLicense_1Year,
  buildProposalNumbers,
  buildSlideNumbers,
  buildMultiCategoryProposalNumbers,
  DEFAULT_CONFIG,
  round2,
} = require('../src/pricing');

test('displayed per-license price times license count equals the displayed Sub-Total exactly', () => {
  const numbers = buildMultiCategoryProposalNumbers(
    {
      lineItems: [
        { categoryTier: '2cat', licenseCount: 300 },
        { categoryTier: '1cat', licenseCount: 200 },
      ],
      pricingYear: 2023,
      nonProfit: false,
      priceAdjustmentPct: 0,
      specialDiscountPct: 0,
    },
    DEFAULT_CONFIG
  );

  const row = numbers.rows[0];
  assert.equal(row.costPerUser1Yr.toFixed(2), '64.48', 'displayed per-license price matches what the user sees');
  assert.equal(row.subTotal.toFixed(2), '19344.00', 'Sub-Total is the rounded per-license price times the license count');
  assert.equal((row.costPerUser1Yr * row.licenseCount).toFixed(2), row.subTotal.toFixed(2));
});

test('volume-tier index is monotonically non-increasing as license count grows', () => {
  const boundaries = [1, 4, 5, 9, 10, 49, 50, 99, 100, 199, 200, 499, 500, 999, 1000, 1999, 2000, 3999, 4000, 5999, 6000, 7999, 8000, 9999, 10000, 19999, 20000, 29999, 30000, 49999, 50000, 99999, 100000, 150000];
  let prevIndex = Infinity;
  for (const n of boundaries) {
    const idx = computeVolumeIndex(n, DEFAULT_CONFIG);
    assert.ok(idx <= prevIndex + 1e-9, `volume index must not increase at n=${n} (got ${idx}, previous ${prevIndex})`);
    prevIndex = idx;
  }
});

test('computeVolumeIndex matches an independent brute-force reimplementation', () => {
  function bruteForceVolumeIndex(licenses, config) {
    let factor = 1.0;
    let remaining = licenses;
    let weightedSum = 0;
    let totalUnits = 0;
    for (const tier of config.volumeTiers) {
      if (remaining <= 0) break;
      const tierFactor = factor * (1 - tier.discountVsPrev);
      const bracketSize = tier.to == null ? remaining : Math.min(tier.to - tier.from + 1, remaining);
      weightedSum += tierFactor * bracketSize;
      totalUnits += bracketSize;
      remaining -= bracketSize;
      factor = tierFactor;
    }
    return weightedSum / totalUnits;
  }
  const samples = [1, 2, 3, 4, 5, 6, 9, 10, 25, 49, 50, 75, 99, 100, 150, 199, 200, 350, 499, 500, 750, 999, 1000, 1500, 1999, 2000, 3000, 3999, 4000, 5000, 5999, 6000, 7000, 7999, 8000, 9000, 9999, 10000, 15000, 19999, 20000, 25000, 29999, 30000, 40000, 49999, 50000, 75000, 99999, 100000, 250000];
  for (const n of samples) {
    assert.ok(Math.abs(computeVolumeIndex(n, DEFAULT_CONFIG) - bruteForceVolumeIndex(n, DEFAULT_CONFIG)) < 1e-12, `mismatch at n=${n}`);
  }
});

test('0% special discount never alters the underlying base price, in either pricing path', () => {
  for (const tier of Object.keys(DEFAULT_CONFIG.categoryWeights)) {
    for (const licenses of [1, 20, 21, 100, 5000]) {
      const standard = buildProposalNumbers({ licenses, categoryTier: tier, pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0 }, DEFAULT_CONFIG);
      assert.equal(standard.afterDiscountCostPerUser, standard.costPerUser1Yr, `standard path, tier=${tier}, n=${licenses}`);
      assert.ok(Math.abs(standard.subTotal - standard.costPerUser1Yr * licenses) < 1e-9);
    }
  }
});

test('non-profit discount is exactly nonProfitDiscountPct off the base price (outside the flat small-order band)', () => {
  for (const licenses of [21, 100, 1000]) {
    const base = computeAll5CategoryBasePrice(licenses, 2023, false, 0, DEFAULT_CONFIG);
    const nonProfit = computeAll5CategoryBasePrice(licenses, 2023, true, 0, DEFAULT_CONFIG);
    const expectedRatio = 1 - DEFAULT_CONFIG.nonProfitDiscountPct;
    assert.ok(Math.abs(nonProfit / base - expectedRatio) < 1e-9, `n=${licenses}: ratio=${nonProfit / base}`);
  }
});

test('category weights apply proportionally to the All-5-Categories price, for every tier', () => {
  const licenses = 250;
  const all5 = computeCostPerLicense_1Year(licenses, 'all5', 2023, false, 0, DEFAULT_CONFIG);
  for (const [tier, weight] of Object.entries(DEFAULT_CONFIG.categoryWeights)) {
    const tierCost = computeCostPerLicense_1Year(licenses, tier, 2023, false, 0, DEFAULT_CONFIG);
    assert.ok(Math.abs(tierCost - all5 * weight) < 1e-9, `tier=${tier}`);
  }
});

test('standard path: multi-row aggregation is an exact sum, and multi-year figures are exactly combinedSubTotal * (1 - pct)', () => {
  const scenarios = [
    { rows: [{ licenses: 400, categoryTier: '2cat' }, { licenses: 200, categoryTier: '3cat' }, { licenses: 50, categoryTier: '1cat' }], specialDiscountPct: 0.12, nonProfit: false },
    { rows: [{ licenses: 15, categoryTier: 'all5' }], specialDiscountPct: 0, nonProfit: true },
    { rows: [{ licenses: 10000, categoryTier: '4cat' }, { licenses: 3000, categoryTier: '1to2courses' }], specialDiscountPct: 0.35, nonProfit: false },
  ];
  for (const s of scenarios) {
    const result = buildSlideNumbers({ rows: s.rows, pricingYear: 2023, nonProfit: s.nonProfit, specialDiscountPct: s.specialDiscountPct }, DEFAULT_CONFIG);
    const manualSum = result.rows.reduce((sum, r) => sum + r.subTotal, 0);
    assert.equal(result.combinedSubTotal, manualSum);
    for (const [term, pct] of Object.entries(DEFAULT_CONFIG.multiYearDiscounts)) {
      assert.equal(result.multiYear[term], round2(result.combinedSubTotal * (1 - pct)));
    }
  }
});

test('holistic path: splitting the same combined license count into more line items does not change the per-license base price or grand total', () => {
  const oneLineItem = buildMultiCategoryProposalNumbers(
    { lineItems: [{ categoryTier: '2cat', licenseCount: 500 }], pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0 },
    DEFAULT_CONFIG
  );
  const threeLineItems = buildMultiCategoryProposalNumbers(
    {
      lineItems: [
        { categoryTier: '2cat', licenseCount: 300 },
        { categoryTier: '2cat', licenseCount: 100 },
        { categoryTier: '2cat', licenseCount: 100 },
      ],
      pricingYear: 2023,
      nonProfit: false,
      priceAdjustmentPct: 0,
      specialDiscountPct: 0,
    },
    DEFAULT_CONFIG
  );
  assert.equal(oneLineItem.all5CategoryPricePerLicense, threeLineItems.all5CategoryPricePerLicense);
  assert.ok(Math.abs(oneLineItem.grandSubTotal - threeLineItems.grandSubTotal) < 1e-6);
});

test('holistic path: grandSubTotal is an exact sum of row subtotals, and multi-year figures are exactly grandSubTotal * (1 - pct)', () => {
  const scenarios = [
    { lineItems: [{ categoryTier: '2cat', licenseCount: 300 }, { categoryTier: '1cat', licenseCount: 200 }], specialDiscountPct: 0, nonProfit: false },
    { lineItems: [{ categoryTier: 'all5', licenseCount: 50 }, { categoryTier: '4cat', licenseCount: 30 }, { categoryTier: '1to2courses', licenseCount: 20 }], specialDiscountPct: 0.25, nonProfit: true },
    { lineItems: [{ categoryTier: '3cat', licenseCount: 12000 }, { categoryTier: '2cat', licenseCount: 8000 }], specialDiscountPct: 0.1, nonProfit: false },
  ];
  for (const s of scenarios) {
    const result = buildMultiCategoryProposalNumbers({ ...s, pricingYear: 2023, priceAdjustmentPct: 0 }, DEFAULT_CONFIG);
    const manualSum = result.rows.reduce((sum, r) => sum + r.subTotal, 0);
    assert.ok(Math.abs(result.grandSubTotal - manualSum) < 1e-9);
    for (const [term, pct] of Object.entries(DEFAULT_CONFIG.multiYearDiscounts)) {
      assert.equal(result.multiYear[term], round2(result.grandSubTotal * (1 - pct)));
    }
    if (s.specialDiscountPct === 0) {
      result.rows.forEach((r) => assert.equal(r.afterDiscountCostPerUser, r.costPerUser1Yr));
    }
  }
});

test('small-order 2023 flat pricing: applies at exactly 20 licenses, not at 21, and not in other years', () => {
  const at20 = computeAll5CategoryBasePrice(20, 2023, false, 0, DEFAULT_CONFIG);
  const at21 = computeAll5CategoryBasePrice(21, 2023, false, 0, DEFAULT_CONFIG);
  // The flat price gets the LMS add-on but NOT the 2023 price-adjustment bump —
  // that bump only applies in the volume-tier branch, per computeAll5CategoryBasePrice.
  const flatExpected = DEFAULT_CONFIG.smallOrder2023.flatPricePerLicense * (1 + (DEFAULT_CONFIG.yearTable[2023].inclLMS ? DEFAULT_CONFIG.lmsAddOnPct : 0));
  assert.ok(Math.abs(at20 - flatExpected) < 1e-6);
  assert.ok(Math.abs(at21 - flatExpected) > 1e-6, 'license 21 must use the volume formula, not the flat price');
  const at20_2018 = computeAll5CategoryBasePrice(20, 2018, false, 0, DEFAULT_CONFIG);
  assert.ok(Math.abs(at20_2018 - flatExpected) > 1e-6, 'the 2023 flat price must not apply in other years');
});

test('addendum acceptance numbers still reproduce exactly (regression)', () => {
  const result = buildMultiCategoryProposalNumbers(
    {
      lineItems: [
        { categoryTier: '2cat', licenseCount: 300 },
        { categoryTier: '1cat', licenseCount: 200 },
      ],
      pricingYear: 2023,
      nonProfit: false,
      priceAdjustmentPct: 0,
      specialDiscountPct: 0,
    },
    DEFAULT_CONFIG
  );
  assert.equal(round2(result.all5CategoryPricePerLicense), 92.11);
  assert.equal(round2(result.grandSubTotal), 30398.00);
});
