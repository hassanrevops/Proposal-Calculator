'use strict';

// Section 3 constants — transcribed exactly from the implementation brief. This is
// only the SEED/default config, used to bootstrap the admin-editable config store
// on first run (see src/config-store.js) and as a fallback if the store is empty.
// Every pricing function below takes `config` as an explicit parameter instead of
// closing over these — so admin edits to the store take effect immediately, with
// no code change or redeploy.
const DEFAULT_CONFIG = {
  volumeTiers: [
    { from: 1, to: 4, discountVsPrev: 0.00 },
    { from: 5, to: 9, discountVsPrev: 0.40 },
    { from: 10, to: 49, discountVsPrev: 0.40 },
    { from: 50, to: 99, discountVsPrev: 0.40 },
    { from: 100, to: 199, discountVsPrev: 0.35 },
    { from: 200, to: 499, discountVsPrev: 0.35 },
    { from: 500, to: 999, discountVsPrev: 0.30 },
    { from: 1000, to: 1999, discountVsPrev: 0.30 },
    { from: 2000, to: 3999, discountVsPrev: 0.25 },
    { from: 4000, to: 5999, discountVsPrev: 0.25 },
    { from: 6000, to: 7999, discountVsPrev: 0.20 },
    { from: 8000, to: 9999, discountVsPrev: 0.20 },
    { from: 10000, to: 19999, discountVsPrev: 0.10 },
    { from: 20000, to: 29999, discountVsPrev: 0.10 },
    { from: 30000, to: 49999, discountVsPrev: 0.10 },
    { from: 50000, to: 99999, discountVsPrev: 0.10 },
    { from: 100000, to: null, discountVsPrev: 0.10 },
  ],

  yearTable: {
    2018: { basePrice: 119.88, inclLMS: false },
    2019: { basePrice: 179.88, inclLMS: false },
    2020: { basePrice: 179.88, inclLMS: true },
    2021: { basePrice: 269.82, inclLMS: true },
    2022: { basePrice: 364.257, inclLMS: true },
    2023: { basePrice: 364.257, inclLMS: true },
  },

  // Which yearTable entry the public portal (both proposal modes) actually prices
  // against. Admin-editable from the Year Table's "Default" column — switching it
  // takes effect on the very next proposal generated, no code change or redeploy.
  defaultPricingYear: 2023,

  categoryWeights: {
    all5: 1.00,
    '4cat': 0.90,
    '3cat': 0.80,
    '2cat': 0.70,
    '1cat': 0.60,
    '1to2courses': 0.30,
  },

  categoryDisplayNames: {
    all5: 'All 5 Categories',
    '4cat': '4 Categories',
    '3cat': '3 Categories',
    '2cat': '2 Categories',
    '1cat': '1 Category',
    '1to2courses': '1-2 Courses',
  },

  // What the Multi-Year Agreements block on the proposal actually uses (Section 5 decision).
  multiYearDiscounts: { '2yr': 0.20, '3yr': 0.30, '5yr': 0.40 },

  lmsAddOnPct: 0.43,
  nonProfitDiscountPct: 0.05,
  smallOrder2023: { licenseLimit: 20, flatPricePerLicense: 349.99 * (300 / 429) },
  priceAdjustment2023Bump: 0.20,
};

// Kept for reference/back-office use only — NOT used for the proposal's Multi-Year
// Agreements block, and not part of the editable config since changing it has no
// effect on any generated proposal.
const termDiscounts_calculatorNative = { '1yr': 0.00, '2yr': 0.10, '3yr': 0.15 };

/**
 * Section 4: computeVolumeIndex(licenses)
 * Blends the per-tier discount factors across every bracket the license count spans.
 */
function computeVolumeIndex(licenses, config) {
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

/**
 * Section 4: the "All 5 Categories, 1-Year, per license" price BEFORE the category
 * weight is applied. Split out of computeCostPerLicense_1Year so the multi-category
 * split addendum can compute this once against a combined license count and apply
 * per-category weights afterward, without duplicating the volume/year/non-profit math.
 */
function computeAll5CategoryBasePrice(licenses, pricingYear, nonProfit, priceAdjustmentPct, config) {
  let solutionPrice;

  if (pricingYear === 2023 && licenses <= config.smallOrder2023.licenseLimit) {
    solutionPrice = config.smallOrder2023.flatPricePerLicense;
  } else {
    const volumeIndex = computeVolumeIndex(licenses, config);
    const basePrice = config.yearTable[pricingYear].basePrice;
    const adjFactor = 1 + priceAdjustmentPct + (pricingYear === 2023 ? config.priceAdjustment2023Bump : 0);
    const nonProfitFactor = nonProfit ? (1 - config.nonProfitDiscountPct) : 1.0;
    solutionPrice = volumeIndex * basePrice * adjFactor * nonProfitFactor;
  }

  const lmsAddOn = config.yearTable[pricingYear].inclLMS ? solutionPrice * config.lmsAddOnPct : 0;
  return solutionPrice + lmsAddOn;
}

/**
 * Section 4: computeCostPerLicense_1Year(...)
 * Returns the "All 5 Categories, 1-Year, per license" price weighted down to the requested category tier.
 */
function computeCostPerLicense_1Year(licenses, categoryTier, pricingYear, nonProfit, priceAdjustmentPct, config) {
  return computeAll5CategoryBasePrice(licenses, pricingYear, nonProfit, priceAdjustmentPct, config) * config.categoryWeights[categoryTier];
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Section 4: buildProposalNumbers(inputs, config)
 *
 * Every monetary figure is rounded to cents as soon as it's computed, and that
 * rounded value — not the full-precision one — feeds the next step (e.g. costPerUser1Yr
 * rounds first, then afterDiscountCostPerUser is computed from the ROUNDED costPerUser1Yr,
 * then subTotal from the ROUNDED afterDiscountCostPerUser, and so on). This matches how
 * the figures are actually built by hand off a calculator display, one rounded line at a
 * time, rather than carrying hidden fractional cents through the whole chain.
 */
function buildProposalNumbers(inputs, config) {
  const costPerUser1YrRaw = computeCostPerLicense_1Year(
    inputs.licenses,
    inputs.categoryTier,
    inputs.pricingYear,
    inputs.nonProfit,
    inputs.priceAdjustmentPct,
    config
  );
  const costPerUser1Yr = round2(costPerUser1YrRaw);
  const afterDiscountCostPerUser = round2(costPerUser1Yr * (1 - inputs.specialDiscountPct));
  const subTotal = round2(afterDiscountCostPerUser * inputs.licenses);

  const multiYear = {};
  for (const [term, pct] of Object.entries(config.multiYearDiscounts)) {
    multiYear[term] = round2(subTotal * (1 - pct));
  }

  return { costPerUser1Yr, afterDiscountCostPerUser, subTotal, multiYear };
}

/**
 * A proposal slide can bundle multiple pricing rows (e.g. 400 licenses/2-cat and
 * 200 licenses/3-cat as two rows in the same table). Rows share the slide's
 * nonProfit status and specialDiscountPct — both negotiated per slide, not per
 * row — but each row has its own licenses/categoryTier. The Multi-Year Agreements
 * figures are derived from the combined Sub-Total across all rows on that slide,
 * not from any single row.
 */
function buildSlideNumbers({ rows, pricingYear, nonProfit, specialDiscountPct }, config) {
  const rowResults = rows.map((row) => {
    const numbers = buildProposalNumbers(
      {
        licenses: row.licenses,
        categoryTier: row.categoryTier,
        pricingYear,
        nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct,
      },
      config
    );
    return { ...row, ...numbers, specialDiscountPct };
  });

  const combinedSubTotal = rowResults.reduce((sum, r) => sum + r.subTotal, 0);

  const multiYear = {};
  for (const [term, pct] of Object.entries(config.multiYearDiscounts)) {
    multiYear[term] = round2(combinedSubTotal * (1 - pct));
  }

  return { rows: rowResults, combinedSubTotal, multiYear };
}

/**
 * Multi-Category Split addendum: a single deal split across two or more category
 * tiers (e.g. 500 total licenses = 300 at "2cat" + 200 at "1cat"). The volume-tier
 * calculation MUST run once against the combined total license count across every
 * line item — never per line item's own count — since volume tiers are a shared,
 * cumulative bracket system (running it per sub-group throws away the volume
 * discount the full deal would earn together). Only the category weight and the
 * license multiplier are applied per line item, after that shared base price is
 * computed. Every monetary figure is rounded to cents as soon as it's computed and
 * that rounded value feeds the next step, matching buildProposalNumbers' rule —
 * so a line item's displayed per-license price times its license count always
 * equals its displayed Sub-Total exactly, with no residual fractional cents.
 */
function buildMultiCategoryProposalNumbers({ lineItems, pricingYear, nonProfit, priceAdjustmentPct, specialDiscountPct }, config) {
  const totalLicenses = lineItems.reduce((sum, li) => sum + li.licenseCount, 0);
  const all5CategoryPricePerLicense = round2(computeAll5CategoryBasePrice(totalLicenses, pricingYear, nonProfit, priceAdjustmentPct, config));

  const rows = lineItems.map((li) => {
    const costPerUser1Yr = round2(all5CategoryPricePerLicense * config.categoryWeights[li.categoryTier]);
    const afterDiscountCostPerUser = round2(costPerUser1Yr * (1 - specialDiscountPct));
    const subTotal = round2(afterDiscountCostPerUser * li.licenseCount);
    return {
      licenseCount: li.licenseCount,
      categoryTier: li.categoryTier,
      categoryDisplayLabel: li.categoryDisplayLabel,
      costPerUser1Yr,
      afterDiscountCostPerUser,
      subTotal,
    };
  });

  const grandSubTotal = rows.reduce((sum, r) => sum + r.subTotal, 0);

  const multiYear = {};
  for (const [term, pct] of Object.entries(config.multiYearDiscounts)) {
    multiYear[term] = round2(grandSubTotal * (1 - pct));
  }

  return { totalLicenses, all5CategoryPricePerLicense, rows, grandSubTotal, multiYear };
}

module.exports = {
  DEFAULT_CONFIG,
  termDiscounts_calculatorNative,
  computeVolumeIndex,
  computeAll5CategoryBasePrice,
  computeCostPerLicense_1Year,
  buildProposalNumbers,
  buildSlideNumbers,
  buildMultiCategoryProposalNumbers,
  round2,
};
