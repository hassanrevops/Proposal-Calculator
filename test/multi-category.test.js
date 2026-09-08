'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildMultiCategoryProposalNumbers, round2, DEFAULT_CONFIG } = require('../src/pricing');

function multiCategoryInputs(overrides = {}) {
  return {
    lineItems: [
      { categoryTier: '2cat', licenseCount: 300, categoryDisplayLabel: 'Tech & Safety' },
      { categoryTier: '1cat', licenseCount: 200, categoryDisplayLabel: 'Compliance' },
    ],
    pricingYear: 2023,
    nonProfit: false,
    priceAdjustmentPct: 0,
    specialDiscountPct: 0,
    ...overrides,
  };
}

// Addendum acceptance test: 500 total licenses split 300/200 across two category tiers.
test('multi-category split acceptance numbers', () => {
  const n = buildMultiCategoryProposalNumbers(multiCategoryInputs(), DEFAULT_CONFIG);

  assert.equal(n.totalLicenses, 500);
  assert.equal(round2(n.all5CategoryPricePerLicense), 92.11);

  assert.equal(round2(n.rows[0].costPerUser1Yr), 64.48);
  assert.equal(round2(n.rows[0].subTotal), 19344.00);

  assert.equal(round2(n.rows[1].costPerUser1Yr), 55.27);
  assert.equal(round2(n.rows[1].subTotal), 11054.00);

  assert.equal(round2(n.grandSubTotal), 30398.00);
});

// Regression guard: this is the specific bug the addendum exists to prevent. If the
// volume index is (wrongly) computed per line item's own count instead of the
// combined total, the grand total balloons to ~$41,641 instead of ~$30,398.
test('regression: volume tiers must use the combined total, not each line item on its own', () => {
  const n = buildMultiCategoryProposalNumbers(multiCategoryInputs(), DEFAULT_CONFIG);

  assert.ok(
    Math.abs(n.grandSubTotal - 30398.00) < 0.5,
    `expected grandSubTotal near $30,398.00, got $${round2(n.grandSubTotal)}`
  );
  assert.ok(
    Math.abs(n.grandSubTotal - 41641) > 1000,
    'grandSubTotal is suspiciously close to the known wrong-scoped-volume total (~$41,641) — ' +
      'volume index is likely being computed per line item instead of on the combined total'
  );
});

// A single-line-item deal is just this same structure with one entry, and shares
// computeAll5CategoryBasePrice with the single-category path — so the per-license
// price matches ($19.80), and since both paths now round every monetary figure to
// cents at each step (see buildProposalNumbers' and buildMultiCategoryProposalNumbers'
// doc comments), the grand total matches the single-category path's $15,840.00 too.
test('a single line item shares the per-license price and grand total with the single-category path', () => {
  const n = buildMultiCategoryProposalNumbers(
    multiCategoryInputs({
      lineItems: [{ categoryTier: '1to2courses', licenseCount: 1000, categoryDisplayLabel: 'Unlimited LMS Access' }],
      specialDiscountPct: 0.2,
    }),
    DEFAULT_CONFIG
  );

  assert.equal(round2(n.rows[0].costPerUser1Yr), 19.8);
  assert.equal(round2(n.grandSubTotal), 15840.00);
});
