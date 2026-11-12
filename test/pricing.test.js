'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProposalNumbers, DEFAULT_CONFIG } = require('../src/pricing');

// The unified pricing calculator's rule is final: a category tier scales only the 60%
// Library share of the combined LMS + Library price, and the 40% LMS platform share is
// always full price. A 100% Library / 0% LMS split reproduces the earlier behavior
// (tier weight x full price), which is what the original real-proposal figures used.
const LEGACY_CONFIG = { ...DEFAULT_CONFIG, lmsSplit: { library: 1, lms: 0 } };

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Section 6 acceptance test, as originally quoted: the real North Texas Contracting
// proposal. "Unlimited LMS Access" (custom label) maps to the 1to2courses tier (weight
// 0.30). These are the legacy figures (weight x full price), kept so that rule stays
// reproducible from config alone.
test('North Texas Contracting acceptance numbers (legacy 100% Library split)', () => {
  const numbers = buildProposalNumbers(
    {
      licenses: 1000,
      categoryTier: '1to2courses',
      pricingYear: 2023,
      nonProfit: false,
      priceAdjustmentPct: 0,
      specialDiscountPct: 0.20,
    },
    LEGACY_CONFIG
  );

  assert.equal(round2(numbers.costPerUser1Yr), 19.80);
  assert.equal(round2(numbers.afterDiscountCostPerUser), 15.84);
  assert.equal(round2(numbers.subTotal), 15840.00);
  assert.equal(round2(numbers.multiYear['2yr']), 12672.00);
  assert.equal(round2(numbers.multiYear['3yr']), 11088.00);
  assert.equal(round2(numbers.multiYear['5yr']), 9504.00);
});

// Same deal under the current (calculator) rule: 1-2 Courses is 30% of the Library
// share only, so it costs 0.6 x 0.30 + 0.4 = 58% of the All-5-Categories price.
test('North Texas Contracting deal under the unified calculator rule', () => {
  const numbers = buildProposalNumbers(
    { licenses: 1000, categoryTier: '1to2courses', pricingYear: 2023, nonProfit: false, priceAdjustmentPct: 0, specialDiscountPct: 0.20 },
    DEFAULT_CONFIG
  );

  assert.equal(round2(numbers.costPerUser1Yr), 38.29);
  assert.equal(round2(numbers.afterDiscountCostPerUser), 30.63);
  assert.equal(round2(numbers.subTotal), 30630.00);
  assert.equal(round2(numbers.multiYear['2yr']), 24504.00);
  assert.equal(round2(numbers.multiYear['3yr']), 21441.00);
  assert.equal(round2(numbers.multiYear['5yr']), 18378.00);
});
