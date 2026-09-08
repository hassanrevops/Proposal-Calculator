'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');

const {
  DEFAULT_CONFIG,
  buildProposalNumbers,
  buildSlideNumbers,
  buildMultiCategoryProposalNumbers,
} = require('./src/pricing');
const { getConfig, saveConfig, validateConfig } = require('./src/config-store');
const { verifyPassword, changePassword, requireAuth } = require('./src/auth');
const { generateProposalPptx } = require('./src/pptx-fill');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
}));

// Visiting any public proposal page immediately ends an admin session — an admin
// who navigates back to the public app must log in again next time, rather than
// staying signed in indefinitely just because the session cookie is still valid.
const PUBLIC_PAGE_PATHS = ['/', '/index.html', '/manual.html', '/multi-category.html'];
app.use((req, res, next) => {
  if (PUBLIC_PAGE_PATHS.includes(req.path) && req.session && req.session.authenticated) {
    req.session.destroy(() => next());
  } else {
    next();
  }
});

app.use(express.static(path.join(__dirname, 'public')));

function currencySymbolFor(code) {
  const map = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };
  return map[code] || '$';
}

// ---------------------------------------------------------------------------
// Live-preview calculation endpoints — pure math, no .pptx template involved.
// These power the real-time preview on all three proposal pages.
// ---------------------------------------------------------------------------

app.post('/calculate-row', async (req, res) => {
  try {
    const config = await getConfig();
    const { licenses, categoryTier, specialDiscountPct, nonProfit, categoryDisplayLabel } = req.body;
    const numbers = buildProposalNumbers(
      {
        licenses: Number(licenses),
        categoryTier,
        pricingYear: config.defaultPricingYear,
        nonProfit: !!nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct: Number(specialDiscountPct) / 100,
      },
      config
    );
    res.json({
      categoryDisplayLabel: categoryDisplayLabel || config.categoryDisplayNames[categoryTier] || categoryTier,
      costPerUser1Yr: numbers.costPerUser1Yr,
      afterDiscountCostPerUser: numbers.afterDiscountCostPerUser,
      subTotal: numbers.subTotal,
      multiYear: numbers.multiYear,
      multiYearPct: {
        '2yr': config.multiYearDiscounts['2yr'] * 100,
        '3yr': config.multiYearDiscounts['3yr'] * 100,
        '5yr': config.multiYearDiscounts['5yr'] * 100,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/calculate-multi-category', async (req, res) => {
  try {
    const config = await getConfig();
    const { lineItems, specialDiscountPct, nonProfit } = req.body;
    const numbers = buildMultiCategoryProposalNumbers(
      {
        lineItems: lineItems.map((li) => ({
          licenseCount: Number(li.licenseCount),
          categoryTier: li.categoryTier,
          categoryDisplayLabel: config.categoryDisplayNames[li.categoryTier] || li.categoryTier,
        })),
        pricingYear: config.defaultPricingYear,
        nonProfit: !!nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct: Number(specialDiscountPct) / 100,
      },
      config
    );
    res.json({
      rows: numbers.rows,
      grandSubTotal: numbers.grandSubTotal,
      multiYear: numbers.multiYear,
      multiYearPct: {
        '2yr': config.multiYearDiscounts['2yr'] * 100,
        '3yr': config.multiYearDiscounts['3yr'] * 100,
        '5yr': config.multiYearDiscounts['5yr'] * 100,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Real .pptx generation — requires the actual KnowledgeCity template files in
// templates/. Until those are supplied, these routes return a clear 503 rather
// than a confusing crash.
// ---------------------------------------------------------------------------

app.post('/generate', async (req, res) => {
  try {
    const config = await getConfig();
    const { companyName, proposalDate, currencyCode, slides } = req.body;
    const symbol = currencySymbolFor(currencyCode);

    const builtSlides = slides.map((slide) => {
      const numbers = buildSlideNumbers(
        {
          rows: slide.rows,
          pricingYear: config.defaultPricingYear,
          nonProfit: !!slide.nonProfit,
          specialDiscountPct: Number(slide.specialDiscountPct) / 100,
        },
        config
      );
      return {
        rows: numbers.rows.map((r) => ({ ...r, categoryDisplayLabel: r.categoryDisplayLabel || config.categoryDisplayNames[r.categoryTier] || r.categoryTier })),
        combinedSubTotal: numbers.combinedSubTotal,
        multiYear: numbers.multiYear,
        includeMultiYearTerms: slide.includeMultiYearTerms !== false,
        includeDiscountColumn: Number(slide.specialDiscountPct) > 0,
        specialNote: slide.specialNote,
      };
    });

    const buffer = await generateProposalPptx(
      { companyName, proposalDate, currencySymbol: symbol, slides: builtSlides },
      config
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${companyName || 'proposal'}.pptx"`);
    res.send(buffer);
  } catch (err) {
    res.status(503).json({
      error: err.message,
      hint: 'Real .pptx generation needs the templates/ folder\'s Template for Proposal.pptx files to be present.',
    });
  }
});

app.post('/generate-multi-category', async (req, res) => {
  try {
    const config = await getConfig();
    const { companyName, proposalDate, currencyCode, lineItems, specialDiscountPct, nonProfit, includeMultiYearTerms, specialNote } = req.body;
    const symbol = currencySymbolFor(currencyCode);

    const numbers = buildMultiCategoryProposalNumbers(
      {
        lineItems: lineItems.map((li) => ({
          licenseCount: Number(li.licenseCount),
          categoryTier: li.categoryTier,
          categoryDisplayLabel: li.categoryDisplayLabel,
        })),
        pricingYear: config.defaultPricingYear,
        nonProfit: !!nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct: Number(specialDiscountPct) / 100,
      },
      config
    );

    // A Holistic proposal is still just one pricing slide — it just has one table
    // row per line item instead of one row total — so the same generator that
    // builds the Standard Proposal's .pptx (and already clones the template's data
    // row once per entry in `rows`) handles this without any special-casing.
    const slide = {
      // buildMultiCategoryProposalNumbers' rows use `licenseCount` (matching the
      // Holistic addendum's own field naming) and don't carry specialDiscountPct
      // at all (unlike buildSlideNumbers' rows) — pptx-fill's row filler and its
      // "After Discount N%" header both expect the Standard path's row shape, so
      // both are reconciled here.
      rows: numbers.rows.map((r) => ({
        ...r,
        licenses: r.licenseCount,
        specialDiscountPct: Number(specialDiscountPct) / 100,
        categoryDisplayLabel: r.categoryDisplayLabel || config.categoryDisplayNames[r.categoryTier] || r.categoryTier,
      })),
      combinedSubTotal: numbers.grandSubTotal,
      multiYear: numbers.multiYear,
      includeMultiYearTerms: includeMultiYearTerms !== false,
      includeDiscountColumn: Number(specialDiscountPct) > 0,
      specialNote,
    };

    const buffer = await generateProposalPptx(
      { companyName, proposalDate, currencySymbol: symbol, slides: [slide] },
      config
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${companyName || 'proposal'}.pptx"`);
    res.send(buffer);
  } catch (err) {
    res.status(503).json({
      error: err.message,
      hint: 'Real .pptx generation needs the templates/ folder\'s Template for Proposal.pptx files to be present.',
    });
  }
});

app.post('/generate-manual', async (req, res) => {
  try {
    const config = await getConfig();
    const { companyName, proposalDate, currencyCode, slides } = req.body;
    const symbol = currencySymbolFor(currencyCode);

    // Manual Proposal's numbers are exactly what's on screen (engine defaults the
    // user may have overridden) — unlike Standard/Holistic, nothing here is
    // recomputed from the pricing engine; the client's own figures are used as-is.
    const buffer = await generateProposalPptx(
      { companyName, proposalDate, currencySymbol: symbol, slides },
      config
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${companyName || 'proposal'}.pptx"`);
    res.send(buffer);
  } catch (err) {
    res.status(503).json({
      error: err.message,
      hint: 'Real .pptx generation needs the templates/ folder\'s Template for Proposal.pptx files to be present.',
    });
  }
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (verifyPassword(password)) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Incorrect password' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/password', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-password.html'));
});

app.get('/admin/config', requireAuth, async (req, res) => {
  res.json(await getConfig());
});

app.post('/admin/config', requireAuth, async (req, res) => {
  try {
    const saved = await saveConfig(req.body);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/admin/change-password', requireAuth, (req, res) => {
  try {
    changePassword(req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Proposal app listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
