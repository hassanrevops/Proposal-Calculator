'use strict';

// Request validation for the calculate / generate endpoints. Every failure carries
// status 400 and a plain-language message the UI can show as-is, so bad input never
// surfaces as a raw JavaScript error or a misleading "server error".

const MAX_LICENSES = 10000000;
const MAX_ROWS_PER_SLIDE = 30;
const MAX_SLIDES = 25;
const MAX_NOTE_LENGTH = 500;
const MAX_NAME_LENGTH = 200;

function fail(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function requireObject(value, what = 'request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(`Invalid ${what}.`);
  return value;
}

function requireArray(value, what, min, max) {
  if (!Array.isArray(value) || value.length < min) throw fail(`Add at least ${min} ${what}${min === 1 ? '' : 's'}.`);
  if (value.length > max) throw fail(`Too many ${what}s (the limit is ${max}).`);
  return value;
}

function parseLicenses(value, label = 'Number of licenses') {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < 1) throw fail(`${label} must be at least 1.`);
  if (n > MAX_LICENSES) throw fail(`${label} can't be more than ${MAX_LICENSES.toLocaleString('en-US')}.`);
  return Math.floor(n);
}

// Returns a 0-1 fraction from a percentage the user typed (blank counts as 0).
function parseDiscountFraction(value) {
  const n = value === '' || value == null ? 0 : Number(value);
  if (!Number.isFinite(n) || n < 0 || n >= 100) throw fail('Special discount must be between 0 and 99.99%.');
  return n / 100;
}

function parseText(value, label, { required = false, max = MAX_NAME_LENGTH } = {}) {
  const s = value == null ? '' : String(value).trim();
  if (required && !s) throw fail(`${label} is required.`);
  if (s.length > max) throw fail(`${label} is too long (the limit is ${max} characters).`);
  return s;
}

function parseMoney(value, label) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < 0 || n > 1e12) throw fail(`${label} must be a number of 0 or more.`);
  return n;
}

// Manual Proposal: the figures are exactly what the rep typed, so only their shape is
// checked and everything is rebuilt into a clean slide object.
function parseManualSlides(slides) {
  requireArray(slides, 'pricing slide', 1, MAX_SLIDES);
  return slides.map((raw, i) => {
    const slide = requireObject(raw, `slide ${i + 1}`);
    const rows = requireArray(slide.rows, `row on slide ${i + 1}`, 1, MAX_ROWS_PER_SLIDE).map((r) => {
      const row = requireObject(r, `row on slide ${i + 1}`);
      return {
        licenses: parseLicenses(row.licenses, `Slide ${i + 1}: number of licenses`),
        categoryDisplayLabel: parseText(row.categoryDisplayLabel, `Slide ${i + 1}: category label`, { required: true }),
        costPerUser1Yr: parseMoney(row.costPerUser1Yr, `Slide ${i + 1}: cost per user`),
        afterDiscountCostPerUser: parseMoney(row.afterDiscountCostPerUser, `Slide ${i + 1}: after-discount cost per user`),
        subTotal: parseMoney(row.subTotal, `Slide ${i + 1}: sub-total`),
        specialDiscountPct: Math.min(0.9999, Math.max(0, Number(row.specialDiscountPct) || 0)),
      };
    });
    const my = requireObject(slide.multiYear || {}, `multi-year amounts on slide ${i + 1}`);
    const pct = requireObject(slide.multiYearPct || {}, `multi-year percentages on slide ${i + 1}`);
    const multiYear = {};
    const multiYearPct = {};
    for (const term of ['2yr', '3yr', '5yr']) {
      multiYear[term] = parseMoney(my[term] == null ? 0 : my[term], `Slide ${i + 1}: ${term} amount`);
      const p = Number(pct[term]);
      multiYearPct[term] = (Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0) / 100;
    }
    return {
      rows,
      combinedSubTotal: parseMoney(slide.combinedSubTotal, `Slide ${i + 1}: total`),
      multiYear,
      multiYearPct,
      includeMultiYearTerms: slide.includeMultiYearTerms !== false,
      includeDiscountColumn: !!slide.includeDiscountColumn,
      specialNote: parseText(slide.specialNote, `Slide ${i + 1}: special note`, { max: MAX_NOTE_LENGTH }),
    };
  });
}

module.exports = {
  fail, requireObject, requireArray, parseLicenses, parseDiscountFraction, parseText, parseMoney, parseManualSlides,
  MAX_ROWS_PER_SLIDE, MAX_SLIDES, MAX_NOTE_LENGTH, MAX_NAME_LENGTH,
};
