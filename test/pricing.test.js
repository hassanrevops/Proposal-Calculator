'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProposalNumbers, DEFAULT_CONFIG } = require('../src/pricing');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Section 6 acceptance test: reproduce the real North Texas Contracting proposal.
// "Unlimited LMS Access" (custom label) maps to the 1to2courses tier (weight 0.30) —
// that's the only enum weight that reproduces $19.80 for these inputs; flagged in
// the brief as needing confirmation with Zainab before being hardcoded as a default.
test('North Texas Contracting acceptance numbers', () => {
  const numbers = buildProposalNumbers(
    {
      licenses: 1000,
      categoryTier: '1to2courses',
      pricingYear: 2023,
      nonProfit: false,
      priceAdjustmentPct: 0,
      specialDiscountPct: 0.20,
    },
    DEFAULT_CONFIG
  );

  assert.equal(round2(numbers.costPerUser1Yr), 19.80);
  assert.equal(round2(numbers.afterDiscountCostPerUser), 15.84);
  assert.equal(round2(numbers.subTotal), 15840.00);
  assert.equal(round2(numbers.multiYear['2yr']), 12672.00);
  assert.equal(round2(numbers.multiYear['3yr']), 11088.00);
  assert.equal(round2(numbers.multiYear['5yr']), 9504.00);
});
